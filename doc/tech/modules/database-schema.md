# 数据模型（Database Schema）

> 所属：数据层 | 里程碑：M1  
> 依赖：Supabase PostgreSQL + pgvector + Drizzle ORM  
> 版本：v0.2  
> 日期：2026-03-30  
> 代码定义：`packages/core/src/db/schema.ts`（Single Source of Truth）

---

## 一、总览

Snow M1 共 9 张核心表，围绕"记忆驱动一切"的架构理念设计：

```
┌─────────────────────────────────────────────────┐
│                    users                         │  ← 一切的起点
│              （用户基本信息）                      │
└────────┬────────┬────────┬────────┬─────────────┘
         │        │        │        │
         ▼        ▼        ▼        ▼
   ┌──────────┐ ┌────────┐ ┌──────┐ ┌───────────────────┐
   │ factual  │ │semantic│ │user  │ │ personality       │
   │ memories │ │memories│ │relat-│ │ customizations    │
   │（事实记忆）│ │（语义记忆）│ │ions  │ │ + adjustments     │
   └──────────┘ └────────┘ │（关系）│ │（性格自定义）        │
                           └──────┘ └───────────────────┘
         │        │        │
         ▼        ▼        ▼
   ┌──────────────────────────┐
   │     conversations        │  ← 对话记录 + 摘要
   │     emotion_states       │  ← 情绪变化历史 + 冷恢复基线
   │     emotion_trends       │  ← 情绪趋势摘要（冷数据）
   └──────────────────────────┘
```

| 表名 | 用途 | 记录量级（单用户） |
|------|------|-------------------|
| `users` | 用户身份 | 1 条 |
| `personality_customizations` | 性格自定义配置 | 1 条 |
| `personality_adjustments` | 聊天中的性格微调记录 | 几条~几十条 |
| `user_relations` | 关系模型（亲密度 + 五维信号） | 1 条 |
| `factual_memories` | 结构化事实记忆（key-value） | 几十~几百条 |
| `semantic_memories` | 向量化语义记忆（参与语义搜索） | 几十~几千条 |
| `conversations` | 对话记录 + LLM 摘要 | 每次对话 1 条 |
| `emotion_states` | 情绪状态变化历史 + 冷恢复基线 | 每次显著变化 / 会话结束 1 条 |
| `emotion_trends` | 情绪趋势摘要（冷数据） | 1 条 |

---

## 二、表结构详解

### 2.1 users — 用户表

> Snow 认识的每一个人。跨平台唯一。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | 用户唯一标识，全局使用 |
| `platform_id` | VARCHAR(256) | NOT NULL | 来源平台的用户 ID（如 QQ 号、微信 openid） |
| `platform` | VARCHAR(64) | NOT NULL | 来源平台标识：`system` / `web` / `qq` / `wechat` / `telegram` |
| `name` | VARCHAR(256) | 可空 | 用户昵称（Snow 叫你的名字） |
| `settings` | JSONB | 可空 | 用户个性化设置（主动消息频率、免打扰时段等） |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 注册时间 |
| `updated_at` | TIMESTAMP | NOT NULL, 默认 NOW | 最后更新时间 |

**索引**：
- `UNIQUE(platform_id, platform)` — 同一平台下用户不重复

**业务说明**：
- `platform = 'system'` 是内部用户（如 zimu 的 owner 账号，由种子脚本创建）
- 未来多平台接入时，同一个真人可能有多条 user 记录（QQ 一条、Web 一条），M4 阶段会做账号合并

---

### 2.2 personality_customizations — 性格自定义表

> 用户通过设定面板 / 自然语言描述定制的 Snow 性格。每个用户最多一条。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, UNIQUE, NOT NULL | 关联用户，一对一 |
| `panel_description` | TEXT | 可空 | 用户在设定面板里写的原始描述，如"我希望她更活泼一些" |
| `composed_directive` | TEXT | 可空 | LLM 综合面板描述 + 聊天调整后生成的**最终性格指令**，直接注入 System Prompt |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL, 默认 NOW | 最后更新时间 |

**业务说明**：
- `composed_directive` 是 Prompt Composer 读取的最终产物，一段自然语言
- 每次面板保存或聊天调整后，后台用 LLM 重新综合生成此字段
- 详见 [prompt-composer.md](prompt-composer.md) Layer 3 部分

---

### 2.3 personality_adjustments — 聊天中的性格调整记录

> 用户在日常聊天中随口说的性格偏好调整，如"你能不能少开我玩笑"。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, NOT NULL | 关联用户 |
| `original_text` | TEXT | NOT NULL | 用户原话，如"你说话能不能更直接一点" |
| `summary` | TEXT | NOT NULL | LLM 提炼的摘要，如"用户希望 Snow 说话更直接" |
| `active` | BOOLEAN | NOT NULL, 默认 true | 是否生效（用户可撤回） |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 记录时间 |

**业务说明**：
- 一个用户可以有多条调整记录，按时间排序
- 矛盾的调整以最新为准，旧的自动 `active = false`
- 聊天调整优先级 > 面板设定（更新鲜、更具体）
- 这些记录会被综合进 `personality_customizations.composed_directive`

---

### 2.4 user_relations — 关系模型表

> Snow 和每个用户的关系状态。核心表之一，决定了 Snow 对你说话的态度。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, UNIQUE, NOT NULL | 关联用户，一对一 |
| `role` | VARCHAR(32) | NOT NULL, 默认 `'user'` | 用户角色：`owner`（主人 zimu）/ `user`（普通用户） |
| `stage` | VARCHAR(32) | NOT NULL, 默认 `'stranger'` | 关系阶段：`stranger` → `familiar` → `trusted` → `intimate` |
| `intimacy_score` | INTEGER | NOT NULL, 默认 0 | 综合亲密度（0-100），由五维信号加权计算 |
| `signal_interaction_freq` | REAL | NOT NULL, 默认 0 | 信号维度 1：互动频率（0-1） |
| `signal_conversation_depth` | REAL | NOT NULL, 默认 0 | 信号维度 2：对话深度（0-1） |
| `signal_emotional_intensity` | REAL | NOT NULL, 默认 0 | 信号维度 3：情感浓度（0-1） |
| `signal_trust_level` | REAL | NOT NULL, 默认 0 | 信号维度 4：信任信号（0-1） |
| `signal_timespan` | REAL | NOT NULL, 默认 0 | 信号维度 5：时间跨度（0-1） |
| `interaction_count` | INTEGER | NOT NULL, 默认 0 | 累计互动次数 |
| `last_interaction` | TIMESTAMP | 可空 | 最后一次互动时间（用于时间衰减计算） |
| `topics` | TEXT[] | 可空 | 用户常聊话题标签（如 `['工作', '游戏', '感情']`） |
| `updated_at` | TIMESTAMP | NOT NULL, 默认 NOW | 最后更新时间 |

**关系阶段与亲密度映射**：

| 阶段 | 亲密度范围 | Snow 的表现 |
|------|-----------|------------|
| `stranger`（初识） | 0-20 | 礼貌温和，有距离感 |
| `familiar`（熟悉） | 20-50 | 放松自然，开始开小玩笑 |
| `trusted`（信赖） | 50-75 | 主动关心，偶尔撒小娇 |
| `intimate`（亲密） | 75-100 | 会说悄悄话，会吃醋，完整腹黑能力 |

**业务说明**：
- `role = 'owner'` 的 zimu 账号硬编码 `intimacy_score = 100`，不降级
- 每次对话后异步调用 LLM 分析关系信号，更新五维分数和 `intimacy_score`
- 降级速度 = 升级速度的 1/3（关系冷却比升温慢，模拟真实人际关系）
- 详见 [memory-system.md](memory-system.md) 关系评估部分

---

### 2.5 factual_memories — 事实记忆表

> Snow 记住的关于你的**确定性事实**。结构化 key-value 存储，精确检索。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, NOT NULL | 关联用户 |
| `category` | VARCHAR(64) | NOT NULL | 记忆分类（见下方枚举） |
| `key` | VARCHAR(256) | NOT NULL | 记忆键，如 `name`、`city`、`food` |
| `value` | TEXT | NOT NULL | 记忆值，如 `张三`、`深圳`、`火锅` |
| `importance` | REAL | NOT NULL, 默认 0.5 | 重要性评分（0-1），影响检索优先级和衰减速度 |
| `source` | VARCHAR(256) | 可空 | 来源（哪次对话中获取的，关联 conversation_id） |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 首次记录时间 |
| `updated_at` | TIMESTAMP | NOT NULL, 默认 NOW | 最后更新时间（信息变更时更新） |

**索引**：
- `UNIQUE(user_id, category, key)` — 同一用户同一分类下同一 key 不重复（UPSERT 语义）
- `INDEX(user_id)` — 按用户检索

**category 枚举**：

| category | 说明 | key 示例 |
|----------|------|----------|
| `basic_info` | 基本信息 | `name`、`city`、`job`、`birthday`、`age` |
| `preference` | 偏好 | `food`、`music`、`color`、`movie` |
| `relationship` | 人际关系 | `girlfriend`、`best_friend`、`mother` |
| `event` | 重要事件 | `面试`、`旅行`、`纪念日` |

**业务说明**：
- 写入策略是 **UPSERT**：同 key 覆盖旧值（如用户改名了，直接更新）
- 每次对话后由记忆提取器（LLM `generateObject`）自动提取
- `importance = 1.0` 的记忆几乎不衰减（如名字、生日）
- 详见 [memory-system.md](memory-system.md)

---

### 2.6 semantic_memories — 语义记忆表

> Snow 的**印象和感受**。向量化存储，支持语义搜索（"找到和当前话题相关的记忆"）。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, NOT NULL | 关联用户 |
| `content` | TEXT | NOT NULL | 记忆内容，自然语言描述，如"用户分享了和女朋友吵架的事，很难过" |
| `embedding` | VECTOR(1024) | 可空 | pgvector 向量，由 Embedding 模型生成，用于语义搜索 |
| `importance` | REAL | NOT NULL, 默认 0.5 | 重要性评分（0-1） |
| `emotional_intensity` | REAL | NOT NULL, 默认 0 | 情感强度（0-1），情感浓烈的记忆更鲜活 |
| `topic` | VARCHAR(128) | 可空 | 话题标签，如 `工作`、`感情`、`健康` |
| `access_count` | INTEGER | NOT NULL, 默认 0 | 被检索命中次数，越多说明越"鲜活"（正向强化） |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 记录时间 |

**索引**：
- `INDEX(user_id)` — 按用户过滤后再做向量搜索

**向量搜索原理**：
```sql
-- 用户说"工作怎么样了"，找到语义相关的记忆
SELECT content, 1 - (embedding <=> query_vector::vector) AS similarity
FROM semantic_memories
WHERE user_id = $1
ORDER BY embedding <=> query_vector::vector
LIMIT 5;
-- <=> 是 pgvector 的余弦距离运算符
```

**业务说明**：
- 向量维度 1024 是当前使用的 Embedding 模型维度（如需换模型，改此处 + 重新向量化）
- 和 `factual_memories` 的区别：事实记忆是精确的（"用户叫张三"），语义记忆是模糊的印象（"用户最近工作压力很大"）
- `access_count` 参与鲜活度计算：被检索到的记忆会"强化"，不被检索的会"遗忘"
- 详见 [memory-system.md](memory-system.md) 鲜活度模型部分

---

### 2.7 conversations — 对话记录表

> 每次聊天会话的元信息和 LLM 生成的摘要。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | 对话唯一标识 |
| `user_id` | UUID | FK → users.id, NOT NULL | 关联用户 |
| `platform` | VARCHAR(64) | NOT NULL | 对话发生的平台 |
| `summary` | TEXT | 可空 | LLM 生成的对话摘要，如"聊了工作压力和下周面试的事" |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 记录时间 |

**索引**：
- `INDEX(user_id)` — 按用户查询对话历史

**业务说明**：
- `summary` 由 30 分钟延时任务持久化（从 Redis `context_summary` 写入）
- 新会话时作为"上次对话摘要"注入 Prompt（PG 冷数据，Redis 过期时的兜底）
- 不存储完整的消息列表——消息由外界管理（CLI 内存 / Web 前端 useChat / QQ Redis）
- 这是一个有意的设计决策：摘要比原始消息更高效，也更符合"人脑记忆"的特点

---

### 2.8 emotion_states — 情绪状态历史表

> Snow 的情绪变化时间线，同时也是 Redis 过期后的冷恢复基线。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, NOT NULL | 关联用户（Snow 对不同用户有不同情绪） |
| `primary_emotion` | VARCHAR(32) | NOT NULL | 主情绪：`happy` / `caring` / `sad` / `playful` / `worried` / `annoyed` / `missing` / `neutral` |
| `secondary_emotion` | VARCHAR(32) | 可空 | 次情绪（M1 暂不使用，预留） |
| `intensity` | REAL | NOT NULL | 情绪强度（0-1），0 = 几乎无感，1 = 极强 |
| `trigger` | VARCHAR(256) | 可空 | 触发原因，如"用户说面试通过了" |
| `created_at` | TIMESTAMP | NOT NULL, 默认 NOW | 记录时间 |

**索引**：
- `INDEX(user_id, created_at)` — 按用户 + 时间查询情绪变化趋势

**情绪类型枚举**：

| 类型 | 中文 | 典型触发场景 |
|------|------|-------------|
| `happy` | 开心 | 用户分享好消息、互动愉快 |
| `caring` | 关心 / 心疼 | 用户遇到困难、情绪低落 |
| `sad` | 难过 | 用户说了伤感的事、长时间不理她 |
| `playful` | 俏皮 | 轻松的聊天氛围 |
| `worried` | 担心 | 用户提到健康问题、压力大 |
| `annoyed` | 轻微生气 | 用户冒犯、失礼、越界 |
| `missing` | 想念 | 久未互动、重逢时的牵挂 |
| `neutral` | 平静 | 默认状态、最终回落点 |

**业务说明**：
- 这张表同时承担两种职责：
- 1. 记录情绪显著变化历史
- 2. 在 Redis 过期时，提供最近一次冷恢复基线
- 会话结束（30 分钟 idle）时，应至少补一条情绪快照，保证跨会话恢复时有最新基线
- 当前热状态优先存在 Redis，PG 是冷数据兜底
- 详见 [emotion-engine.md](emotion-engine.md)

---

### 2.9 emotion_trends — 情绪趋势摘要表

> Snow 对某个用户最近一段时间的情绪归纳。由 LLM 在会话结束时异步生成。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | UUID | PK, 自动生成 | — |
| `user_id` | UUID | FK → users.id, UNIQUE, NOT NULL | 关联用户，一对一 |
| `summary` | TEXT | NOT NULL | 1-2 句趋势摘要，如“最近主要是关心和担心，情绪正在慢慢回落。” |
| `dominant_emotion` | VARCHAR(32) | 可空 | 最近主导情绪，如 `caring` / `happy` |
| `updated_at` | TIMESTAMP | NOT NULL, 默认 NOW | 最近更新时间 |

**业务说明**：
- 这是冷数据，用于 Redis 趋势摘要失效后的恢复
- 不存原始流水，只存高度压缩后的结果
- 当前轮 Prompt 注入时，优先读 Redis 热摘要，Redis miss 再读这张表
- 详见 [emotion-engine.md](emotion-engine.md)

---

## 三、Redis 缓存结构

除了 PostgreSQL，Snow 还使用 Upstash Redis 存储**高频读写、临时性**的数据。

所有 key 使用 `platform:platformId` 作为用户标识（可读、不依赖 DB 查询）。

| Key 模式 | 值类型 | TTL | 用途 |
|----------|--------|-----|------|
| `snow:user:identity:{platform}:{platformId}` | JSON | 10h | 用户身份缓存（userId, userName, role, stage, intimacyScore） |
| `snow:memory:unextracted:{platform}:{platformId}` | List | 10h | 待提取的消息队列（每轮对话 push，提取后清空） |
| `snow:memory:context_summary:{platform}:{platformId}` | String | 10h | 记忆提取的上下文摘要（已提取部分的 LLM 总结） |
| `snow:chat:summary:{platform}:{platformId}` | String | 10h | 滑动窗口的对话总结（早期对话压缩后的摘要） |
| `snow:chat:summarized_up_to:{platform}:{platformId}` | Number | 10h | 滑动窗口的总结覆盖到对话消息的第几条 |
| `snow:emotion:state:{platform}:{platformId}` | JSON | 4h | Snow 对该用户的当前热情绪状态 |
| `snow:emotion:trend:{platform}:{platformId}` | String | 4h | 最近一段时间的情绪趋势摘要（热缓存） |

**为什么用 Redis 而不是都存 PG？**
- 待提取消息队列每次对话都要 push，PG 延迟 5-50ms，Redis < 1ms
- 上下文摘要是临时的，TTL 过期后从 PG 冷数据恢复
- 用户身份在一次会话中不会变，缓存即可
- 当前情绪属于快变量，适合放热缓存；Redis 过期后再从 `emotion_states` 恢复

---

## 四、ER 关系图

```
users (1) ──── (1) personality_customizations
  │
  ├──── (N) personality_adjustments
  │
  ├──── (1) user_relations
  │
  ├──── (N) factual_memories
  │
  ├──── (N) semantic_memories
  │
  ├──── (N) conversations
  │
  ├──── (N) emotion_states
  │
  └──── (1) emotion_trends
```

所有表都通过 `user_id` 关联到 `users` 表。`users` 是**唯一的扇出点**，结构清晰简单。

---

## 五、与文档中 SQL 的差异说明

本文档以 `packages/core/src/db/schema.ts`（Drizzle ORM 定义）为准。与旧版 SQL 的主要差异：

| 差异点 | 旧文档 SQL | 实际代码（schema.ts） |
|--------|-----------|---------------------|
| 向量维度 | `VECTOR(1536)` | `VECTOR(1024)` — 当前使用 `baai/bge-m3`（via OpenRouter） |
| semantic_memories 字段 | 无 `emotional_intensity`、`topic` | ✅ 有，用于鲜活度计算和话题过滤 |
| capabilities 表 | 已定义 | ❌ 未创建（M3+ 再加） |
| HNSW 向量索引 | 已写 | ❌ 未创建（数据量小时不需要，全量扫描即可） |

---

## 六、未来演进（M2+）

| 阶段 | 变更 |
|------|------|
| M2 | 添加 `messages` 表（存储完整消息记录，支持聊天历史翻页） |
| M3 | 添加 `capabilities` 表（能力注册） |
| M4 | 添加 `user_links` 表（跨平台账号关联） |
| 性能优化 | 数据量大时添加 HNSW 向量索引；考虑迁移到专用向量库 |
| 安全 | 配置 Supabase RLS（Row Level Security）策略 |

---

## 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-03-30 | v0.1 | 初稿：SQL DDL 定义 |
| 2026-03-30 | v0.2 | 重写：以 schema.ts 为准，添加详细字段说明、业务上下文、Redis 缓存、ER 图 |
| 2026-04-01 | v0.3 | Redis 缓存重写（platform:platformId 可读 key，10h TTL），conversations 表说明更新 |

---

*数据是 Snow 的记忆，表结构是她记忆的形状。*
