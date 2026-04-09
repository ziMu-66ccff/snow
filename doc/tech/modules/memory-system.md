# 记忆系统（Memory Engine）

> 所属：核心基础设施 | 里程碑：M1  
> 依赖：Supabase (PostgreSQL + pgvector) + Upstash Redis + OpenRouter `baai/bge-m3` Embedding（1024 维）  
> 版本：v1.0  
> 日期：2026-04-01

记忆系统是 Snow 的**核心基础设施**，所有"有人味"的能力都依赖它。

---

## 一、设计理念

> Snow 的记忆像人脑，不像硬盘。

| 人类记忆特征 | Snow 的实现 |
|-------------|------------|
| 会遗忘 | 时间衰减函数，鲜活度随时间降低 |
| 可唤醒 | 向量语义搜索，相似话题能触发旧记忆 |
| 重要的不忘 | 重要性评分高的记忆衰减极慢 |
| 越提越牢 | 每次被检索到，记忆权重被强化 |
| 情感加深记忆 | 伴随强烈情绪的记忆，重要性自动提升 |
| 亲密的人记得多 | 关系亲密度高的用户，记忆检索更多、衰减更慢 |
| 有些事真的忘了 | 鲜活度极低的记忆会被定期清理（彻底遗忘） |

---

## 二、存储了什么？

Snow 的记忆由 4 种东西组成，存在不同的地方：

### 2.1 事实记忆 — "她确切知道的事"

精确、结构化、可更新的 key-value 信息。

**存储**：PostgreSQL `factual_memories` 表

```
user_id │ category     │ key       │ value
────────┼──────────────┼───────────┼───────────
张三    │ basic_info   │ name      │ 张三
张三    │ basic_info   │ city      │ 深圳
张三    │ basic_info   │ birthday  │ 3月15日
张三    │ preference   │ food      │ 喜欢火锅
张三    │ relationship │ girlfriend│ 有，叫小美
张三    │ event        │ 面试      │ 下周五腾讯面试
```

**特点**：
- 每个 key 只保留最新值（不追加，覆盖更新）
- 不参与向量搜索，每次直接查出来放进 Prompt（必选池）
- 相当于 Snow "确切知道的事"

**事实类型**：

| category | 说明 | 示例 |
|----------|------|------|
| basic_info | 核心身份信息 | 名字、城市、职业、生日 |
| preference | 偏好 | 喜欢的食物、音乐、颜色 |
| relationship | 人际关系 | 家人、朋友、恋人 |
| event | 事件 | 即将发生或刚发生的事 |
| opinion | 观点 | 对某件事的看法 |

---

### 2.2 语义记忆 — "她对你的印象"

一段段自然语言描述的、带情感色彩的"印象"，就像人脑里"我记得他好像说过……"的感觉。

**存储**：PostgreSQL `semantic_memories` 表 + pgvector 向量

```
user_id │ content                              │ embedding  │ importance │ emotional_intensity │ access_count
────────┼──────────────────────────────────────┼────────────┼────────────┼─────────────────────┼─────────────
张三    │ "他最近工作压力很大，经常加班到很晚"    │ [0.12,...] │ 0.6        │ 0.4                 │ 3
张三    │ "他说下周五要去腾讯面试，语气有些紧张"  │ [0.34,...] │ 0.8        │ 0.7                 │ 1
张三    │ "他和女朋友小美最近因为异地有些矛盾"    │ [0.56,...] │ 0.7        │ 0.8                 │ 2
张三    │ "他说小时候在老家看过很大的雪，很想念"   │ [0.91,...] │ 0.5        │ 0.6                 │ 0
```

**特点**：
- 自然语言，带情感色彩
- 有对应的向量，用于语义搜索
- **会衰减、会被强化、会被遗忘** — 鲜活度模型作用在这里
- 这就是 Snow 的"记忆" — 不是精确的数据，是模糊的印象

---

### 2.3 对话摘要 — "上次我们聊了什么"

每段对话的摘要，让 Snow 知道"上次聊了什么"。

**存储**：
- 热数据：Upstash Redis `snow:memory:context_summary:{platform}:{platformId}`（10h TTL）
- 冷数据：PostgreSQL `conversations` 表（延时任务持久化）

**特点**：
- 增量记忆提取时在 Redis 维护上下文摘要（热数据）
- 30 分钟延时任务触发时持久化到 PG（冷数据）
- 新会话时 Snow 从 Redis（优先）或 PG（兜底）读取上次对话摘要
- 非新会话时只读 PG（Redis 里的是当前会话的，和 history 重叠）

---

### 2.4 情绪状态 — "她现在的心情"

Snow 对这个用户的当下情绪状态。

**存储**：Upstash Redis（24 小时过期）

```json
{
  "primary": "happy",
  "intensity": 0.8,
  "updatedAt": "2026-03-30T12:30:00"
}
```

**特点**：
- 临时的，不是"记忆"，是"当下状态"
- 每次对话实时更新
- 24 小时过期，过期后回到 neutral

---

### 四种存储的配合

当用户发来"最近怎么样"时：

```
① 事实记忆 → "他叫张三，在深圳做前端，女朋友叫小美"      → 必选池
② 对话摘要 → "上次聊了面试通过的事，他很开心"             → 必选池
③ 语义记忆 → 向量搜索"最近怎么样"的相关印象：
              · "他最近工作压力大"（相似度高 + 鲜活）       → 动态池 ✅
              · "和女朋友有矛盾"（中等相似 + 还算鲜活）     → 动态池 ✅
              · "小时候看雪"（相似度低，不相关）             → 跳过 ❌
④ 情绪状态 → happy（上次聊完他很开心）                    → 情绪层

Snow 回复："面试过了之后工作还顺利吗？别太拼了哦…对了小美那边最近还好吗？🤭"
```

---

## 三、记忆鲜活度模型

每条语义记忆有一个动态的**鲜活度（vividness）**，决定它有多容易被"想起来"。

### 公式

```
鲜活度 = 基础重要性 × 时间衰减 × 强化系数 × 情感加成 × 关系加成
```

```typescript
function memoryVividness(memory: Memory, relation: UserRelation): number {
  // 1. 基础重要性（LLM 写入时评估，0-1）
  const importance = memory.importance;
  
  // 2. 时间衰减（指数衰减）
  //    半衰期：普通记忆 30 天，重要记忆 180 天
  const halfLife = importance > 0.7 ? 180 : 30;
  const daysSince = daysBetween(memory.createdAt, now());
  const timeDecay = Math.exp(-0.693 * daysSince / halfLife);
  //    最低保底 0.05 — 再久也不会完全归零（可唤醒）
  const decay = Math.max(0.05, timeDecay);
  
  // 3. 强化系数（被想起的次数越多，记忆越牢）
  const reinforcement = 1 + 0.3 * Math.log(1 + memory.accessCount);
  
  // 4. 情感加成（伴随强烈情感的记忆更深刻）
  const emotionBoost = 1 + (memory.emotionalIntensity || 0) * 0.5;
  
  // 5. 关系加成（对亲密的人记得更多）
  const relationBoost = 1 + (relation.intimacyScore / 100) * 0.3;
  
  return importance * decay * reinforcement * emotionBoost * relationBoost;
}
```

### 实际效果

| 场景 | 鲜活度 | Snow 的表现 |
|------|--------|------------|
| 昨天说的事 | 很高 | 清晰记得细节 |
| 一个月前提过一次的小事 | 很低 | 已经模糊了 |
| 半年前的事但后来又聊过两次 | 中等 | 被强化了，还记得 |
| 用户哭着说的一件事 | 高 | 情感加成，过了很久还记得 |
| 用户的名字、生日 | 极高 | importance=1.0，几乎不衰减 |
| 亲密用户的日常琐事 | 比新用户高 | 关系加成让它活得更久 |

### 唤醒机制

鲜活度保底 0.05 意味着记忆不会真正"消失"。如果用户聊到了高度相似的话题：

```
最终得分 = 向量相似度 × 0.5 + 鲜活度 × 0.5

一条老记忆：鲜活度 = 0.05（几乎要忘了）
但向量相似度 = 0.95（话题高度相关）
最终得分 = 0.95 × 0.5 + 0.05 × 0.5 = 0.50 → 可能被检索到！

效果："等等…我好像记得你之前提过这件事…"
```

这就是"以为忘了，但突然又想起来了"的效果。

### 彻底遗忘

```typescript
// 每周运行一次的清理任务
async function memoryGarbageCollection(userId: string) {
  const relation = await getRelation(userId);
  const allMemories = await getSemanticMemories(userId);
  
  for (const memory of allMemories) {
    const vividness = memoryVividness(memory, relation);
    
    if (vividness < 0.02) {
      // 鲜活度极低 → 真正删除（彻底遗忘）
      await deleteMemory(memory.id);
    }
  }
}

// 永远不删的记忆
const PROTECTED = [
  (m) => m.importance >= 0.9,        // 核心重要记忆
  (m) => m.category === 'basic_info' 
         && ['name', 'birthday'].includes(m.key), // 名字和生日
];
```

---

## 四、记忆提取方案

### 核心接口

外界只需要调一个函数，记忆提取全自动：

```typescript
const response = await getChatResponse({
  platformId: 'zimu',
  platform: 'system',
  messages,  // 完整对话历史，含当前消息（对齐 AI SDK useChat 标准）
});
```

### 提取时机

**增量提取 + 延时兜底**，不依赖"对话结束"事件：

| 时机 | 触发条件 | 做什么 |
|------|---------|--------|
| **轮次触发** | Redis `unextracted` 队列 >= 10 条（5 轮） | 异步提取记忆 + 更新上下文摘要 |
| **延时触发** | 30 分钟延时任务到期 | 提取剩余记忆 + 持久化摘要到 PG |
| **CLI 退出** | 调用 `finalizeSession()` | 同延时触发（CLI 特例，因为进程要退出） |

**为什么不等对话结束？**
1. 多平台（微信/QQ/Web）没有明确的"对话结束"事件
2. 长会话中早期对话如果不及时提取，重要信息可能丢失

### 提取流程

每次 `getChatResponse` 被调用后，通过 `onFinish` 回调自动执行（不阻塞回复）：

```
1. 将本轮 user + assistant 消息 push 到 Redis unextracted 队列
2. 检查 unextracted 长度 >= 10？→ 触发增量提取
3. 推 30 分钟延时任务（新的覆盖旧的）

增量提取执行：
  a. 原子取出 unextracted（rename 防丢数据）
  b. Redis 读 context_summary 作为背景上下文
  c. LLM 提取 facts + impressions + updates → 写 PG
  d. 生成新 context_summary → 更新 Redis
  e. 延时任务额外：持久化 context_summary 到 PG conversations 表
```

### 提取上下文策略

每次增量提取时，输入给 LLM 的内容分两部分：

```
[上下文] Redis context_summary（之前已提取部分的摘要，仅供理解背景，不从中提取）
+
[提取对象] unextracted 队列中的消息（从中提取记忆）
```

上下文摘要的维护：
- 每次提取后，旧摘要 + 本次消息 → 拼接
- 拼接后 > 1500 字 → LLM 压缩为 200 字要点
- 拼接后 <= 1500 字 → 直接用

### 提取内容

一次 LLM 调用，同时提取：

| 类别 | 说明 | PG 表 |
|------|------|-------|
| facts | 确定性事实（名字、城市、偏好等） | factual_memories（UPSERT） |
| impressions | 语义印象（模糊的感受和判断） | semantic_memories（INSERT + 向量化） |
| updates | 用户纠正了旧信息 | factual_memories（UPDATE）+ semantic_memories（保留历史痕迹） |

### 提取粒度

**原则：宁精不滥。**

- 一次提取最多 5 条事实 + 3 条语义
- 纯闲聊可以提取 0 条

### Redis 存储

| Key | 类型 | TTL | 说明 |
|-----|------|-----|------|
| `snow:memory:unextracted:{platform}:{platformId}` | List | 10h | 待提取消息队列 |
| `snow:memory:context_summary:{platform}:{platformId}` | String | 10h | 记忆提取上下文摘要 |

### 延时任务

| 平台 | 实现方式 |
|------|---------|
| CLI（M1） | setTimeout（进程常驻） |
| Web（M2） | Upstash QStash（Serverless HTTP 回调） |

每次 getChatResponse 都推一个新的延时任务，覆盖上一个（同一用户只有一个待执行的延时任务）。

---

## 五、记忆检索方案

### 两池策略

```
注入 Prompt 的记忆
     ↑
┌────┴──────────────────┐
│  必选池（每次都带）     │  ~200-300 token
│  · 用户基本事实信息     │
│  · 上次对话摘要         │
│  · 关系阶段             │
├────────────────────────┤
│  动态池（按话题检索）   │  ~500-1500 token
│  · pgvector 语义搜索    │
│  · 按 最终得分 排序     │
│  · 最多注入 8 条        │
└────────────────────────┘
```

### 上次对话摘要的取法

根据是否是新会话，取法不同：

| 场景 | 来源 | 理由 |
|------|------|------|
| **非新会话**（history 有多条消息） | 只读 PG | Redis 里的是当前会话的记忆提取摘要，和 history 重叠 |
| **新会话**（history 只有 1 条 user 消息） | Redis + PG 都取 | Redis 可能有刚结束还没持久化的上一段对话；PG 有更早的已持久化摘要。两个都有时拼在一起 |

### 检索流程

```typescript
// 配置常量
const SIMILARITY_THRESHOLD = 0.3;   // 相似度门槛
const CANDIDATE_POOL_SIZE = 50;     // 候选池大小
const MAX_INJECTED_MEMORIES = 8;    // 最大注入条数
const WEIGHT_SIMILARITY = 0.6;      // 相似度权重
const WEIGHT_VIVIDNESS = 0.4;       // 鲜活度权重

async function retrieveMemories(
  userId: string, 
  userMessage: string,
  relation: UserRelation,
): Promise<RetrievedMemories> {

  // === 必选池 ===
  const basicFacts = await getBasicFacts(userId);
  const lastConvo = await getLastConversationSummary(userId);
  
  // === 动态池（两阶段筛选） ===
  
  // 1. 向量化当前消息
  const { embedding: queryVec } = await embed({
    model: getEmbeddingModel(),
    value: userMessage,
  });
  
  // 2. pgvector 搜索候选（取 50 条）
  const candidates = await vectorSearch(userId, queryVec, CANDIDATE_POOL_SIZE);
  
  // 3. 阶段一：相似度门槛过滤（排除不相关的记忆）
  const relevant = candidates.filter(c => c.similarity >= SIMILARITY_THRESHOLD);
  
  // 4. 计算鲜活度 + 归一化
  const maxVividness = Math.max(...relevant.map(m => memoryVividness(m, relation)));
  
  // 5. 阶段二：综合排序
  const scored = relevant.map(m => ({
    ...m,
    finalScore: m.similarity * WEIGHT_SIMILARITY 
              + (memoryVividness(m, relation) / maxVividness) * WEIGHT_VIVIDNESS,
  }));
  scored.sort((a, b) => b.finalScore - a.finalScore);
  const selected = scored.slice(0, MAX_INJECTED_MEMORIES);
  
  // 6. 强化！被想起来了 → accessCount++
  await reinforceMemories(selected.map(m => m.id));
  
  return { mandatory: { basicFacts, lastConvo }, dynamic: selected };
}
```

### 两阶段筛选策略

**为什么不是简单的加权求和？**

相似度和鲜活度的值域不同（相似度 0-1，鲜活度可 >1），直接加权会让鲜活度压过相似度。
更重要的是，**语义相关性是首要条件**——用户在聊工作，不应该因为"昨天聊的火锅鲜活度高"就把火锅排在前面。

| 阶段 | 作用 | 效果 |
|------|------|------|
| 阶段一：门槛过滤 | `similarity >= 0.3` 才入选 | 不相关的记忆再鲜活也进不来 |
| 阶段二：综合排序 | 相似度 60% + 归一化鲜活度 40% | 相关的记忆里，更新鲜的优先 |

| 场景 | 相似度 | 门槛 | 最终结果 |
|------|--------|------|---------|
| 相关且新鲜的记忆 | 0.9 | ✅ 通过 | ✅ 高分入选 |
| 相关但很旧的记忆（唤醒） | 0.8 | ✅ 通过 | ✅ 相似度高，仍能入选 |
| 不相关但很新鲜的记忆 | 0.1 | ❌ 拦截 | ❌ 不会误入 |
| 不相关且旧的记忆 | 0.05 | ❌ 拦截 | ❌ 不会入选 |

---

## 六、滑动窗口

### 目的

控制发给 LLM 的 token 量，防止超出上下文窗口（DeepSeek V3: 64K token）。

### 设计原则

- **保护消息（system + tool）不压缩**：重要、数量少、tool_call/result 不能拆开
- **只对对话消息（user + assistant）计算 token 和裁剪**
- **对话总结存 Redis**，跨请求复用（Serverless 友好）
- 使用 `message-utils.ts` 统一处理 ModelMessage 的多类型 content

### 流程

```
messages 到达
    │
    ├── 分离：保护消息（system + tool） vs 对话消息（user + assistant）
    │
    ├── Redis 读 chat:summary + chat:summarized_up_to
    │   （空值 = 首次对话 / Redis 过期 → 全量传给 LLM，不压缩）
    │
    ├── 异常检测：summarized_up_to > 对话消息数 → history 被重置 → 清空 Redis
    │
    ├── 估算 token：summary + 未总结消息 > 40K？
    │   ├── 否 → 直接用
    │   └── 是 → 保留最近 10 轮 + 早期消息压缩为新 summary（400 字）→ 更新 Redis
    │
    └── 组装：保护消息 + [summary] + 未总结消息
```

### Redis 存储

| Key | 类型 | TTL | 说明 |
|-----|------|-----|------|
| `snow:chat:summary:{platform}:{platformId}` | String | 10h | 早期对话的 LLM 总结 |
| `snow:chat:summarized_up_to:{platform}:{platformId}` | Number | 10h | 总结覆盖到对话消息的第几条 |

---

## 七、总结

```
Snow 的记忆不是硬盘，不是数据库。
是像人脑一样的记忆：

  ✅ 重要的事记得牢
  ✅ 经常聊的事越来越清晰
  ✅ 感情深的事刻骨铭心
  ✅ 琐事慢慢淡忘
  ✅ 但某个瞬间可能突然想起来
  ✅ 有些事真的忘了，再也想不起来
  ✅ 对重要的人，记得更多更久
```

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-03-30 | v0.1 | 初稿：三层架构、读写流程 |
| 2026-03-30 | v0.2 | 完善：四种存储详解、鲜活度模型、提取方案、检索策略、Token 预算、遗忘机制 |
| 2026-04-01 | v1.0 | V2 架构：getChatResponse 一函数搞定、Redis 增量提取、滑动窗口基于 Redis、上次摘要分场景取法、message-utils 多类型 content |
