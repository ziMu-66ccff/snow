# 关系系统（Relation System）

> 所属：核心模块 | 里程碑：M1 Batch 5  
> 依赖：记忆系统、Prompt 编排、DeepSeek Chat  
> 版本：v0.1  
> 日期：2026-04-02  
> 产品设计：`doc/design/persona.md` §八  
> 数据模型：`doc/tech/modules/database-schema.md` §2.4

---

## 一、核心理念

> Snow 和每个用户的关系是活的——会升温，也可能冷却。就像真实的人际关系一样。

关系系统不是"聊了几次就升级"的机械计数器，而是基于**多维信号**的动态评估。Snow 会根据对话中的信号（深度、情感、信任等）自然地调整和你的关系。

**关键原则**：
- 升级不宣布（行为自然变化，不说"恭喜解锁撒娇功能"）
- 降级比升级慢 3 倍（关系冷却是渐进过程）
- owner 不降级（硬编码最高级）

---

## 二、关系阶段

| 阶段 | 亲密度范围 | Snow 的表现 |
|------|-----------|------------|
| `stranger`（初识） | 0-20 | 礼貌温和，有距离感 |
| `familiar`（熟悉） | 20-50 | 放松自然，开始开小玩笑 |
| `trusted`（信赖） | 50-75 | 主动关心，偶尔撒小娇 |
| `intimate`（亲密） | 75-100 | 会说悄悄话，会吃醋，腹黑全开 |
| `owner`（主人） | MAX | 硬编码最高级，zimu 专属 |

关系层 Prompt 模板已在 `ai/prompts/composer.ts` 中实现（Batch 2），Batch 5 不需要改。

---

## 三、五维信号评估

### 3.1 信号定义

每次对话后，LLM 分析对话中的 5 个维度信号（0-1 分）：

| 维度 | 字段 | 正向信号（↑） | 负向信号（↓） |
|------|------|--------------|--------------|
| **互动频率** | `signal_interaction_freq` | 经常聊天、回复及时 | 长期不理、回复很慢 |
| **对话深度** | `signal_conversation_depth` | 分享个人故事、讨论内心感受 | 只发指令、只让她做事 |
| **情感浓度** | `signal_emotional_intensity` | 表达感谢、关心、信任 | 冷淡、敷衍、单字回复 |
| **信任信号** | `signal_trust_level` | 说秘密、问私人建议、寻求安慰 | 不信任建议、反复质疑 |
| **时间跨度** | `signal_timespan` | 持续数周/月的互动 | 用两天就消失了 |

### 3.2 信号分析（evaluator）

用 LLM 分析本次对话，输出 5 维信号增量：

```typescript
// relation/evaluator.ts
interface RelationSignals {
  interactionFreq: number;       // -1 到 1，本次对话对互动频率维度的影响
  conversationDepth: number;     // -1 到 1
  emotionalIntensity: number;    // -1 到 1
  trustLevel: number;            // -1 到 1
  timespan: number;              // 0 到 1（由代码计算，不由 LLM 评估）
}
```

**注意**：`timespan` 不由 LLM 评估——它是客观的时间维度，由代码根据 `lastInteraction` 和当前时间计算。

### 3.3 LLM 分析 Prompt

```
你是 Snow 的关系分析器。请分析以下对话中的关系信号。

对话内容：
${conversationMessages}

请评估以下 4 个维度的变化（-1 到 1 之间的浮点数）：
- interactionFreq: 互动质量（主动聊天、回复积极 → 正；敷衍、单字回复 → 负）
- conversationDepth: 对话深度（分享个人故事、讨论感受 → 正；只发指令 → 负）
- emotionalIntensity: 情感浓度（表达感谢/关心/信任 → 正；冷淡 → 负）
- trustLevel: 信任信号（说秘密、求安慰 → 正；质疑/不信任 → 负）

注意：
- 普通闲聊给 0.1-0.3 的正向分数即可
- 只有明显的正向/负向信号才给高分
- 没有明显信号的维度给 0
```

---

## 四、亲密度计算

### 4.1 加权公式

```
新的五维分数 = 旧分数 + 信号增量 × 学习率
亲密度 = 五维分数的加权和 × 100
```

### 4.2 权重分配

| 维度 | 权重 | 理由 |
|------|------|------|
| 互动频率 | 0.15 | 基础但不决定性——聊得多不代表关系好 |
| 对话深度 | 0.25 | 重要——愿意深度交流说明关系在进步 |
| 情感浓度 | 0.25 | 重要——情感表达是关系升温的核心 |
| 信任信号 | 0.25 | 重要——信任是关系质变的关键 |
| 时间跨度 | 0.10 | 辅助——时间是关系的基础但权重不高 |

### 4.3 学习率

```
升级学习率 = 0.1（每次对话最多影响 10%）
降级学习率 = 0.033（升级的 1/3，关系冷却比升温慢）
```

### 4.4 时间跨度计算

```typescript
// 不由 LLM 评估，代码自动计算
function calculateTimespan(firstInteraction: Date, lastInteraction: Date): number {
  const days = daysBetween(firstInteraction, lastInteraction);
  // 7 天以内: 0-0.3
  // 7-30 天: 0.3-0.6
  // 30-90 天: 0.6-0.8
  // 90+ 天: 0.8-1.0
  if (days <= 7) return Math.min(0.3, days / 7 * 0.3);
  if (days <= 30) return 0.3 + (days - 7) / 23 * 0.3;
  if (days <= 90) return 0.6 + (days - 30) / 60 * 0.2;
  return Math.min(1.0, 0.8 + (days - 90) / 180 * 0.2);
}
```

### 4.5 阶段判定

亲密度变化后，检查是否跨越阶段阈值：

```
intimacyScore < 20  → stranger
intimacyScore < 50  → familiar
intimacyScore < 75  → trusted
intimacyScore >= 75 → intimate
```

**升级时不宣布**——下次对话时 Prompt 的关系层自然变化。

---

## 五、降级保护

### 5.1 降级触发

| 信号 | 说明 |
|------|------|
| 长时间无互动 | 时间衰减，但很慢（周为单位） |
| 连续冷淡回复 | 多次负向信号 |

### 5.2 降级速度

```
降级学习率 = 升级学习率 / 3 = 0.033
```

即使持续负向信号，从 intimate 降到 stranger 也需要大量对话，符合真实人际关系的冷却速度。

### 5.3 特殊保护

- **owner 不降级**：`role = 'owner'` 的用户硬编码 `intimacyScore = 100`，不参与评估
- **不降到零**：最低保底 `intimacyScore = 5`，Snow 不会对任何人变得冷漠
- **恢复加速**：曾经亲密过的用户，回升速度比首次更快（学习率 × 1.5）

---

## 六、时间衰减（空闲降级）

即使没有对话，长时间不互动也会缓慢降低亲密度：

```
每次 getChatResponse 被调用时检查：
  距上次互动 > 7 天？→ 轻微衰减
  距上次互动 > 30 天？→ 中度衰减
  距上次互动 > 90 天？→ 较强衰减

衰减公式：
  衰减量 = (距上次互动天数 / 30) × 2  （每月大约降 2 分）
  intimacyScore = max(5, intimacyScore - 衰减量)
```

**注意**：衰减在 `getChatResponse` 里检查（用户发消息时），不需要额外的定时任务。

---

## 七、执行流程

### 触发时机

和记忆提取共用触发时机，共用数据源（Redis unextracted 队列）：

| 触发条件 | 执行内容 |
|---------|---------|
| 每 5 轮（unextracted >= 10 条） | 提取记忆 + 评估关系 |
| 延时 30 分钟 | 提取记忆 + 评估关系 + 持久化摘要 + GC |

### 编排层

```
executePeriodicTasks(user, messages)    ← 每 5 轮触发
  ├── extractMemories()                 ← 独立函数：记忆提取
  └── evaluateAndUpdateRelation()       ← 独立函数：关系评估 + 更新

executeIdleTasks(user, messages)        ← 延时 30 分钟触发
  ├── extractMemories()
  ├── evaluateAndUpdateRelation()
  ├── 持久化摘要到 PG
  └── GC
```

### 关系评估流程

```
evaluateAndUpdateRelation(userId, platform, platformId, messages):
  1. 读 PG user_relations → role, 五维分数, intimacyScore, lastInteraction
  2. owner? → 跳过（不评估）
  3. 计算时间衰减（距 lastInteraction 的空闲降级）
  4. LLM 分析对话 → 4 维信号增量
  5. 计算 timespan（代码算，非 LLM）
  6. 更新五维分数（旧 + 增量 × 学习率）
  7. 计算新亲密度（加权和 × 100）
  8. 判定新阶段
  9. 写 PG user_relations
  10. 更新 Redis 身份缓存（setCachedUserIdentity）
```

---

## 八、代码结构

```
core/src/relation/
├── evaluator.ts    ← LLM 分析 5 维信号（generateObject + zod schema）
└── updater.ts      ← 加权计算 + 阶段判定 + 写 DB + 更新缓存
```

### evaluator.ts

```typescript
interface EvaluatedSignals {
  interactionFreq: number;       // -1 到 1
  conversationDepth: number;     // -1 到 1
  emotionalIntensity: number;    // -1 到 1
  trustLevel: number;            // -1 到 1
}

async function evaluateRelationSignals(
  conversationMessages: string,
): Promise<EvaluatedSignals>
```

### updater.ts

```typescript
interface UpdateResult {
  oldScore: number;
  newScore: number;
  oldStage: string;
  newStage: string;
  stageChanged: boolean;
}

async function updateRelation(
  userId: string,
  platform: string,
  platformId: string,
  conversationMessages: string,
): Promise<UpdateResult | null>  // null = owner，跳过
```

---

## 九、与其他模块的交互

| 交互 | 方向 | 说明 |
|------|------|------|
| `getChatResponse` → `updater` | 调用 | onFinish 中异步执行关系更新 |
| `updater` → `evaluator` | 调用 | 分析对话信号 |
| `updater` → `redis-store` | 写入 | 更新身份缓存（intimacyScore + stage） |
| `updater` → PG `user_relations` | 写入 | 持久化五维分数 + 亲密度 |
| Prompt Composer ← `user_relations` | 读取 | 关系层 Prompt 模板选择（已实现） |
| 记忆鲜活度 ← `user_relations` | 读取 | relationBoost 计算（已实现） |

---

## 更新日志

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-04-02 | v0.1 | 初稿：五维信号、加权公式、降级保护、执行流程 |
