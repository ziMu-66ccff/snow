# Snow — 技术选型方案

> 版本：v0.3  
> 日期：2026-03-31  
> 作者：zimu  
> 状态：已确认  
> 原则：**Vercel 生态优先、Serverless 优先、没有历史包袱、直接最佳实践**

---

## 一、选型总览

```
┌──────────────────────────────────────────────────────────┐
│                        Vercel 平台                        │
│                                                           │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────────┐  │
│  │  Next.js 15  │  │ Vercel AI  │  │ Vercel Cron Jobs  │  │
│  │  App Router  │  │   SDK 4    │  │ + Upstash QStash  │  │
│  └──────┬──────┘  └─────┬──────┘  └────────┬──────────┘  │
│         │               │                   │             │
│  ┌──────┴───────────────┴───────────────────┴──────────┐  │
│  │              Serverless Functions (Edge/Node)        │  │
│  └──────────────────────┬──────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
  ┌────────────┐  ┌─────────────┐  ┌────────────┐
  │  Supabase   │  │  Upstash    │  │  多模型 LLM │
  │  (PG+向量+  │  │  (Redis+    │  │  via AI SDK │
  │   Auth+     │  │   QStash)   │  │             │
  │   Realtime) │  │             │  │             │
  └────────────┘  └─────────────┘  └────────────┘
```

---

## 二、技术详解（每个技术是什么、为什么选它）

### 2.1 Supabase — "开源的 Firebase，Snow 的一站式后端"

#### 它是什么？

Supabase 是一个开源的后端即服务（BaaS）平台。传统做法你要自己买服务器、装数据库、写认证逻辑、搭 WebSocket——Supabase 把这些全托管了，给你 API 和 SDK 直接调。

#### 它包含什么？

```
Supabase
├── PostgreSQL 数据库    ← 真正的 PostgreSQL，不是阉割版
│   └── pgvector 扩展    ← 向量搜索能力
├── Auth 认证            ← 用户注册/登录/OAuth，开箱即用
├── Realtime 实时通信    ← 数据变更实时推送到前端
├── Storage 文件存储     ← 类似 S3 的文件存储
├── Edge Functions       ← Serverless 函数
└── Dashboard 控制台     ← 可视化管理界面
```

#### 在 Snow 里怎么用？

| Supabase 能力 | Snow 用途 |
|---------------|----------|
| PostgreSQL | 存用户数据、记忆、关系分数、对话记录、性格配置 |
| pgvector | 记忆的语义搜索（"找到和当前话题相关的记忆"） |
| Auth | 用户注册登录，区分不同用户（Snow 对每个人态度不同） |
| Realtime | 主动消息推送（Snow 主动找你说话时，消息实时到达前端） |
| Storage | 未来存表情包、用户头像等 |

#### 代码示例

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 查询用户的记忆
const { data: memories } = await supabase
  .from('factual_memories')
  .select('*')
  .eq('user_id', userId)
  .order('importance', { ascending: false })
  .limit(10);

// 用户注册（一行代码）
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password',
});

// 监听 Snow 的主动消息（前端实时推送）
supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'proactive_messages',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    showNotification(payload.new.content);
  })
  .subscribe();
```

#### 为什么不用 Firebase / Neon？

| 对比 | Firebase | Neon | Supabase ✅ |
|------|----------|------|-----------|
| 数据库 | NoSQL (Firestore) | PostgreSQL | PostgreSQL |
| 向量搜索 | ❌ | ✅ pgvector | ✅ pgvector |
| Auth | ✅ | ❌ 需另接 | ✅ 内置 |
| Realtime | ✅ | ❌ 需另接 | ✅ 内置 |
| 文件存储 | ✅ | ❌ | ✅ 内置 |
| 开源 | ❌ 厂商锁定 | ✅ | ✅ |
| 复杂查询 | ❌ NoSQL 弱 | ✅ SQL | ✅ SQL |

Snow 的记忆系统需要复杂查询（关联、聚合、向量搜索），而且需要 Auth + Realtime。选 Neon 还要另外接 2-3 个服务，选 Supabase 一个全搞定。

---

### 2.2 pgvector — "让数据库懂语义"

#### 问题背景

传统数据库只能做精确匹配和关键词搜索：

```sql
-- 用户说"工作上的事怎么样了"
-- 但记忆里存的是"周五有个面试"
-- LIKE 搜索完全匹配不上！
SELECT * FROM memories WHERE content LIKE '%工作%';  -- 找不到 ❌
```

我们需要的是**语义搜索**——理解意思，而不是匹配文字。

#### 向量化是什么？

把一段文字变成一串数字（向量），让"意思相近"的文字变成"数值接近"的向量：

```
"周五有个面试"       → [0.12, -0.34, 0.78, 0.56, ...]  ─┐
"工作上的事怎么样了"  → [0.15, -0.31, 0.75, 0.52, ...]  ─┤ 距离很近 ✅
                                                          │
"今天吃了火锅"       → [-0.45, 0.67, -0.12, 0.33, ...] ─┘ 距离很远 ❌
```

这些数字由 Embedding 模型（OpenAI `text-embedding-3-small`，通过 OpenRouter 调用）生成，模型"理解"了文本的语义。

#### pgvector 是什么？

PostgreSQL 的一个扩展插件，让你可以在 PG 里直接存储和搜索向量。不需要额外的向量数据库。

#### 在 Snow 里怎么用？

```typescript
// 写入：对话中提取到一条记忆，向量化后存入
const memoryText = "用户说他周五有一个很重要的面试，在腾讯";
const { embedding } = await embed({
  model: openrouter.textEmbeddingModel('openai/text-embedding-3-small'),
  value: memoryText,
});
// embedding = [0.12, -0.34, 0.78, ...] （1536 维向量）
await db.insert(semanticMemories).values({ userId, content: memoryText, embedding });

// 读取：用户说"工作怎么样了"，语义搜索相关记忆
const { embedding: queryVec } = await embed({
  model: openrouter.textEmbeddingModel('openai/text-embedding-3-small'),
  value: "工作上的事后来怎么样了？",
});
const memories = await db.execute(sql`
  SELECT content, 1 - (embedding <=> ${queryVec}::vector) AS similarity
  FROM semantic_memories
  WHERE user_id = ${userId}
  ORDER BY embedding <=> ${queryVec}::vector
  LIMIT 5
`);
// → [{ content: "周五有个面试在腾讯", similarity: 0.89 }]

// 注入 Prompt 后，Snow 就能说：
// "对了，你上次说的面试怎么样了？在腾讯对吧，紧张不？"
```

`<=>` 是 pgvector 的余弦距离运算符，距离越小 = 语义越接近。

---

### 2.3 Drizzle ORM — "类型安全的数据库翻译官"

#### ORM 是什么？

ORM (Object-Relational Mapping) 让你用 TypeScript 操作数据库，而不是写原始 SQL 字符串：

```typescript
// 不用 ORM — 写错字段名编译器不会报错 😱
const result = await client.query('SELECT * FROM users WHERE id = $1', [userId]);

// 用 Drizzle — 字段名自动补全，类型自动推断 🎉
const user = await db.query.users.findFirst({
  where: eq(users.id, userId),
});
```

#### 为什么选 Drizzle 而不是 Prisma？

| 对比 | Prisma | Drizzle ✅ |
|------|--------|---------|
| 冷启动时间 | 慢（1-3s，需加载 Prisma Engine） | **快**（纯 TS，无额外二进制） |
| 包大小 | ~15MB | **~几百KB** |
| SQL 控制力 | 抽象多，复杂查询不方便 | **接近原生 SQL**，想写啥写啥 |
| 类型安全 | ✅ | ✅ |
| Serverless 友好 | ⚠️ 冷启动是硬伤 | ✅ 几乎零开销 |

Serverless Function 每次请求可能冷启动，Prisma 的 Engine 加载是性能瓶颈。Drizzle 纯 TypeScript，没有这个问题。

#### 代码示例

```typescript
// 定义表结构
import { pgTable, uuid, varchar, timestamp, vector } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const semanticMemories = pgTable('semantic_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  content: varchar('content'),
  embedding: vector('embedding', { dimensions: 1024 }),
  createdAt: timestamp('created_at').defaultNow(),
});

// 查询 — 类型安全，写错字段名直接报红
const memories = await db
  .select()
  .from(semanticMemories)
  .where(eq(semanticMemories.userId, userId))
  .orderBy(desc(semanticMemories.importance))
  .limit(10);
```

---

### 2.4 Upstash Redis — "Serverless 的极速缓存"

#### Redis 是什么？

Redis 是一个内存数据库，数据存在内存里，读写极快（微秒级）。和 PostgreSQL 的关系：

| PostgreSQL | Redis |
|-----------|-------|
| 数据存硬盘，持久可靠 | 数据存内存，极快 |
| 适合存"重要的、长期的"数据 | 适合存"临时的、要快速读写的"数据 |
| 响应 5-50ms | 响应 < 1ms |

#### 为什么用 Upstash 而不是自己跑 Redis？

传统 Redis 需要一台一直运行的服务器。Serverless 架构下没有持久服务器。

Upstash 通过 **HTTP API** 访问 Redis，按请求计费，不用就不花钱，和 Vercel 一键集成。

#### 在 Snow 里存什么？

```
Upstash Redis
├── emotion:{userId}     → Snow 对该用户的当前情绪状态（每次对话实时读写）
├── session:{sessionId}  → 最近几轮对话上下文（对话中频繁读取）
├── relation:{userId}    → 关系缓存（避免每次都查 PG）
└── rate:{userId}        → 频率限制（防滥用）
```

#### 代码示例

```typescript
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// 写入情绪（< 1ms）
await redis.set(`emotion:${userId}`, {
  primary: 'happy',
  intensity: 0.7,
  updatedAt: Date.now(),
}, { ex: 86400 }); // 24小时过期

// 读取情绪（< 1ms）
const emotion = await redis.get(`emotion:${userId}`);
```

---

### 2.5 Upstash QStash — "Serverless 的异步任务管家"

#### 解决什么问题？

Snow 的核心循环中，步骤 ⑥（记忆写入）和 ⑦（关系更新）需要额外调用 LLM，耗时 1-2 秒。如果放在主请求里，用户要多等很久。我们需要**异步执行**：先回复用户，后台慢慢处理。

传统方案（BullMQ）需要一个常驻 Worker 进程消费队列——Serverless 环境下没有常驻进程。

#### QStash 怎么做？

**用 HTTP 回调代替常驻 Worker。** 它不需要你运行任何进程，它自己来调你的 API：

```
对话 API 处理完成
  ├── 1. 流式回复给用户 ✅（用户已经看到回复了）
  ├── 2. 发消息给 QStash："请帮我调 /api/memory/extract"（几毫秒，非阻塞）
  └── Function 结束，去睡了 💤

  ......过了 2 秒......

QStash HTTP 调用 → /api/memory/extract（新 Function 被唤醒）
  └── 提取记忆、向量化、写入数据库 ✅

QStash HTTP 调用 → /api/relation/update（新 Function 被唤醒）
  └── 分析关系信号、更新亲密度 ✅
```

#### 代码示例

```typescript
import { Client } from '@upstash/qstash';

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// 在对话 API 中，回复用户后异步触发后台任务
await qstash.publishJSON({
  url: 'https://snow.vercel.app/api/memory/extract',
  body: { userId, conversationId, messages },
  retries: 3,     // 失败重试 3 次
  delay: '2s',    // 延迟 2 秒执行
});
```

#### 和 BullMQ 的对比

| BullMQ | QStash ✅ |
|--------|----------|
| 需要常驻 Redis + Worker | 纯 HTTP，无需运行任何进程 |
| 适合传统服务器 | **专为 Serverless 设计** |
| 自己管理重试/死信 | 自动重试、延迟、去重 |
| 持久连接 | 按次调用 |

---

### 2.6 Vercel AI SDK — "多模型的统一遥控器"

#### 它是什么？

Vercel 出品的 TypeScript AI 工具包。核心价值：**用同一套代码调用任何 LLM**（DeepSeek、OpenAI、Claude、混元...），不用为每个模型写不同的适配逻辑。

#### 核心能力

| 能力 | 说明 |
|------|------|
| 统一接口 | 一套代码切换任何模型 provider |
| 流式输出 | `streamText()` 开箱即用，配合 React `useChat` Hook |
| 结构化输出 | `generateObject()` 让 LLM 输出 JSON，用于记忆提取 |
| Tool Calling | 让 LLM 调用外部工具（MCP/Skill 的基础） |
| 多 Provider | 官方支持 OpenAI, DeepSeek, Anthropic, Google, 混元等 |

#### 代码示例

```typescript
import { streamText, generateObject } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';

const deepseek = createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY });

// 流式对话（核心对话用）
const result = streamText({
  model: deepseek('deepseek-chat'),
  system: composedSystemPrompt,  // Prompt 编排引擎输出
  messages: conversationHistory,
});

// 结构化输出（记忆提取用）
const { object: extracted } = await generateObject({
  model: deepseek('deepseek-chat'),
  schema: z.object({
    facts: z.array(z.object({
      content: z.string(),
      category: z.enum(['basic_info', 'preference', 'event', 'emotion']),
      importance: z.number().min(0).max(1),
    })),
  }),
  prompt: `从以下对话中提取关键信息：\n${messages}`,
});
// extracted.facts = [{ content: "用户周五面试", category: "event", importance: 0.8 }]
```

#### 前端 useChat Hook

```typescript
// 前端一个 Hook 搞定流式对话
'use client';
import { useChat } from 'ai/react';

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map(m => <MessageBubble key={m.id} message={m} />)}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
// 流式输出自动处理，打字效果自动实现 ✨
```

---

### 2.7 关于 Vercel 自有存储的历史说明

你可能听说过 Vercel Postgres 和 Vercel KV，这里澄清一下：

| Vercel 服务 | 底层实际是 | 现状（2025+） |
|-------------|-----------|-------------|
| Vercel Postgres | Neon 贴牌 | ⚠️ 已迁移回 Neon |
| Vercel KV | Upstash Redis 贴牌 | ⚠️ 已迁移回 Upstash |

2024 年底 Vercel 将自有存储全部迁移回原始提供商，改为 **Vercel Marketplace** 模式——在 Vercel Dashboard 里一键接入第三方服务（Supabase、Upstash、Neon 等），环境变量自动注入，体验一样。

**所以我们选的 Supabase + Upstash 就是 Vercel 生态的一等公民，只是不再叫"Vercel XX"了。**

---

## 三、逐层选型

### 3.1 部署平台：Vercel

| 项目 | 选择 | 理由 |
|------|------|------|
| 部署 | **Vercel** | 你的要求，快速部署，Serverless 原生，全球 CDN |
| 运行时 | **Edge + Node.js** | Edge 用于快速路由，Node.js 用于重计算（LLM 调用） |
| CI/CD | **Vercel Git Integration** | 推 main 自动部署，零配置 |

### 3.2 前端框架：Next.js 15 (App Router)

| 项目 | 选择 | 理由 |
|------|------|------|
| 框架 | **Next.js 15 (App Router)** | Vercel 亲儿子，RSC + Server Actions，全栈一体 |
| UI | **Tailwind CSS 4 + shadcn/ui** | 最流行的现代组合，灵活，适合打造有温度的界面 |
| 状态管理 | **Zustand** | 轻量，适合管理对话状态、情绪状态等 |
| 实时通信 | **Supabase Realtime** | Serverless 友好，替代自建 WebSocket |
| 动画 | **Framer Motion** | Snow 的情绪微动画、打字效果等 |
| 流式输出 | **Vercel AI SDK `useChat`** | 开箱即用的流式对话 Hook |

### 3.3 AI / LLM：Vercel AI SDK + 多模型

| 项目 | 选择 | 理由 |
|------|------|------|
| AI 框架 | **Vercel AI SDK 4** | 统一多模型接口、流式输出、Tool Calling、结构化输出 |
| 模型提供商 | **多模型路由**（见下方详细分析） | 不同场景用最合适的模型 |
| Embedding | **OpenAI `text-embedding-3-small` via OpenRouter** | 1536 维，向量化记忆用 |

#### 多模型策略分析

**结论：有必要用多模型，但不是全部场景都用贵的。**

Snow 的场景天然适合多模型路由——不同任务对模型能力的要求差异很大：

| 场景 | 需要什么能力 | 推荐模型 | 成本 |
|------|-------------|---------|------|
| **核心对话**（带性格、带情感） | 角色扮演、情感理解、创造力 | **DeepSeek V3** / Claude Sonnet | 中 |
| **记忆提取**（从对话中提取关键信息） | 信息抽取、结构化输出 | **DeepSeek V3** | 低 |
| **关系信号分析**（评估对话中的关系变化） | 情感分析、推理 | **DeepSeek V3** | 低 |
| **复杂推理/困难对话**（心理疏导等） | 深度推理、同理心 | **Claude Sonnet** / DeepSeek R1 | 高 |
| **轻量任务**（天气查询、简单问答） | 基础能力即可 | **DeepSeek V3** / 轻量模型 | 极低 |

##### 为什么推荐 DeepSeek 为主力？

1. **性价比极高**：能力接近顶级模型，价格低 10-50 倍
2. **中文能力强**：Snow 是中文产品，中文理解和表达是核心
3. **兼容 OpenAI 接口**：Vercel AI SDK 原生支持，零适配成本
4. **角色扮演能力好**：DeepSeek V3 在 RP（角色扮演）场景下表现优秀

##### 多模型路由实现

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { createDeepSeek } from '@ai-sdk/deepseek';

// 模型注册
const models = {
  // 主力模型：日常对话、记忆提取、关系分析
  main: createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })('deepseek-chat'),
  
  // 深度推理：复杂情感场景、困难对话
  reasoning: createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })('deepseek-reasoner'),
  
  // 备用/高端：特殊场景
  premium: createOpenAI({ apiKey: env.OPENAI_API_KEY })('gpt-4o'),
  
  // Embedding
  embedding: createDeepSeek({ apiKey: env.DEEPSEEK_API_KEY })('deepseek-embedding'),
};

// 路由逻辑
function selectModel(context: ConversationContext): Model {
  if (context.needsDeepReasoning) return models.reasoning;
  if (context.isLightTask) return models.main;
  return models.main; // 默认主力
}
```

> **M1 策略**：先用 DeepSeek V3 作为唯一模型，跑通全流程。多模型路由作为 M2 优化。

### 3.4 数据库：Supabase（一站式）

**为什么选 Supabase 而不是 Neon + 其他？**

Supabase = PostgreSQL + pgvector + Auth + Realtime + Storage，**一站搞定**：

| 需求 | Supabase 提供 | 替代方案（需要多个服务） |
|------|-------------|----------------------|
| 结构化数据（用户、关系、记忆） | **Supabase Postgres** | Neon / Vercel Postgres |
| 向量检索（语义记忆） | **pgvector 扩展** | Qdrant Cloud / Pinecone |
| 用户认证 | **Supabase Auth** | NextAuth / Clerk |
| 实时推送（主动消息） | **Supabase Realtime** | Pusher / 自建 WebSocket |
| 文件存储（未来表情包等） | **Supabase Storage** | Vercel Blob / S3 |

| 项目 | 选择 | 理由 |
|------|------|------|
| 数据库 | **Supabase (PostgreSQL)** | Vercel Marketplace 一键接入，免费额度慷慨 |
| 向量检索 | **pgvector（Supabase 内置）** | 不用额外部署向量数据库，PG 原生扩展 |
| ORM | **Drizzle ORM** | 类型安全，轻量，Serverless 友好，比 Prisma 更快 |
| Auth | **Supabase Auth** | 开箱即用，支持社交登录，和数据库天然集成 |
| Realtime | **Supabase Realtime** | 主动消息推送，Serverless 下的 WebSocket 替代 |

#### 为什么 pgvector 而不是专门的向量数据库？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **pgvector (Supabase)** | 零额外部署、和业务数据在同一个库、免费 | 大规模性能不如专用向量库 |
| Qdrant Cloud | 专业向量检索，高性能 | 额外服务、额外费用、额外维护 |
| Pinecone | 托管服务，简单 | 贵，数据在国外 |

**M1 判断**：Snow 的记忆量在早期不会很大（单用户几千条），pgvector 完全够用。如果未来用户量暴涨再迁移到专用向量库。

### 3.5 缓存 & 队列：Upstash

| 项目 | 选择 | 理由 |
|------|------|------|
| Redis 缓存 | **Upstash Redis** | Serverless Redis，按请求付费，Vercel Marketplace 一键接入 |
| 异步任务队列 | **Upstash QStash** | Serverless 消息队列，用于异步记忆写入和关系更新 |
| 定时任务 | **Vercel Cron Jobs + QStash** | 主动消息调度（M2+） |

#### 为什么用 Upstash 而不是 BullMQ？

BullMQ 需要一个持久的 Redis 实例和常驻 Worker 进程——这在 Serverless 环境下不现实。

Upstash QStash 是专为 Serverless 设计的：
- 发消息到队列 → 自动调用你的 API endpoint → 无需常驻进程
- 支持延迟、重试、去重
- 和 Vercel Serverless Functions 完美配合

```
对话完成 → 异步发消息到 QStash
                │
                ├──→ /api/memory/extract  （记忆提取写入）
                └──→ /api/relation/update （关系评估更新）
```

### 3.6 认证：Supabase Auth

| 项目 | 选择 | 理由 |
|------|------|------|
| 认证方案 | **Supabase Auth** | 免费，和数据库集成，支持 OAuth |
| 支持的登录方式 | Email、GitHub、Google、微信（M2+） | 渐进式 |

---

## 四、完整技术栈一览

```
┌─────────────────────────────────────────────────────┐
│  前端                                                │
│  Next.js 15 (App Router) + TypeScript                │
│  Tailwind CSS 4 + shadcn/ui                          │
│  Zustand (状态管理)                                   │
│  Framer Motion (动画)                                 │
│  Vercel AI SDK useChat (流式对话)                     │
├─────────────────────────────────────────────────────┤
│  后端（Serverless）                                   │
│  Next.js API Routes (Route Handlers)                 │
│  Vercel AI SDK 4 (多模型调用)                         │
│  Drizzle ORM (数据库访问)                             │
│  Upstash QStash (异步任务)                            │
├─────────────────────────────────────────────────────┤
│  AI 模型                                             │
│  DeepSeek V3 (主力：对话、记忆提取、关系分析)          │
│  DeepSeek R1 (备用：深度推理)                         │
│  OpenAI text-embedding-3-small via OpenRouter (向量化) │
├─────────────────────────────────────────────────────┤
│  数据存储                                            │
│  Supabase PostgreSQL (结构化数据)                     │
│  Supabase pgvector (向量检索)                         │
│  Supabase Auth (认证)                                │
│  Supabase Realtime (实时推送)                         │
│  Upstash Redis (缓存：情绪状态、会话)                  │
├─────────────────────────────────────────────────────┤
│  调度 & 队列                                         │
│  Upstash QStash (异步任务：记忆写入、关系更新)         │
│  Vercel Cron Jobs (定时任务：主动消息 M2+)            │
├─────────────────────────────────────────────────────┤
│  部署                                                │
│  Vercel (前端 + API)                                 │
│  Supabase Cloud (数据库)                             │
│  Upstash Cloud (Redis + QStash)                     │
│  全部 Serverless，无需维护服务器                      │
└─────────────────────────────────────────────────────┘
```

---

## 五、为什么这套方案好？

### 5.1 全 Serverless，零运维

| 传统方案 | 我们的方案 |
|----------|-----------|
| 买服务器 + 装 Docker + 运维 | 全托管，推代码即部署 |
| Redis 需要常驻实例 | Upstash 按需，不用不收费 |
| 向量数据库另起服务 | pgvector 在 Supabase 里，零额外部署 |
| WebSocket 需要常驻服务 | Supabase Realtime 托管 |
| 定时任务需要 cron 服务器 | Vercel Cron + QStash |

### 5.2 开发体验极好

- **全栈 TypeScript**：前后端一种语言，类型安全
- **Drizzle ORM**：比 Prisma 更快，Serverless 冷启动更短
- **Vercel AI SDK**：多模型统一接口，流式输出开箱即用
- **shadcn/ui**：复制粘贴式组件，完全可定制

### 5.3 成本友好

| 服务 | 免费额度 | 预估月成本（早期） |
|------|---------|-----------------|
| Vercel | Pro $20/月（值得） | $20 |
| Supabase | Free tier: 500MB DB, 50K Auth | $0 (早期免费) |
| Upstash Redis | 10K commands/day free | $0 (早期免费) |
| Upstash QStash | 500 messages/day free | $0 (早期免费) |
| DeepSeek API | 按量付费 | ~$5-20（看用量，含 Embedding） |
| **总计** | | **~$25-40/月** |

### 5.4 可扩展

- 用户量增长 → Supabase 升级套餐，无需迁移
- 向量量太大 → pgvector 迁移到 Qdrant Cloud，改一下检索层
- 需要更强模型 → AI SDK 切换 provider，一行代码
- 接入新平台（QQ/微信/TG）→ 加 API Route 适配器

---

## 六、M1 用到的最小集

M1 不需要全部技术，只需要：

| 组件 | M1 是否需要 | 说明 |
|------|------------|------|
| Next.js 15 | ✅ | 前端 + API |
| Vercel AI SDK | ✅ | 流式对话 |
| DeepSeek V3 | ✅ | 唯一模型（M1 不做多模型路由） |
| Supabase PG | ✅ | 用户、记忆、关系 |
| pgvector | ✅ | 记忆语义检索 |
| DeepSeek Embedding | ✅ | 记忆向量化 |
| Drizzle ORM | ✅ | 数据库访问 |
| Tailwind + shadcn | ✅ | UI |
| Upstash Redis | ✅ | 情绪状态缓存、会话 |
| Upstash QStash | ✅ | 异步记忆写入、关系更新 |
| Supabase Auth | ⚠️ 可选 | M1 可以先简单账号，M2 上完整 Auth |
| Supabase Realtime | ❌ M2+ | 主动消息推送 |
| Vercel Cron | ❌ M2+ | 定时主动消息 |
| 多模型路由 | ❌ M2+ | M1 先单模型 |

---

## 七、项目结构

> 详见 [m1-tasks.md](../tasks/m1-tasks.md) 中的完整项目结构。

```
snow/
├── packages/
│   ├── core/                  ← @snow/core（Snow 的完整灵魂）
│   │   ├── src/
│   │   │   ├── ai/            ← LLM 调用、Prompt 编排
│   │   │   ├── memory/        ← 记忆系统
│   │   │   ├── emotion/       ← 情绪系统
│   │   │   ├── relation/      ← 关系系统
│   │   │   ├── db/            ← 数据访问层
│   │   │   ├── types/
│   │   │   └── index.ts       ← 统一导出
│   │   ├── scripts/           ← 验证脚本
│   │   └── package.json
│   │
│   └── web/                   ← Next.js Web 壳（M2+）
│
├── doc/                       ← 项目文档
├── drizzle/                   ← 迁移文件
├── .env.local
├── pnpm-workspace.yaml
├── drizzle.config.ts
└── package.json
```

---

## 八、已确认事项

| 编号 | 问题 | 结果 |
|------|------|------|
| 1 | DeepSeek API Key | ✅ 已有 |
| 2 | Embedding 方案 | ✅ DeepSeek Embedding（不用 OpenAI） |
| 3 | Supabase 项目 | ✅ 已创建 |
| 4 | Vercel 账号 | ✅ 有，先用免费版 |
| 5 | 域名 | ✅ 先用 vercel.app 子域名 |
| 6 | 包管理器 | ✅ pnpm |
| 7 | Node.js | ✅ v24.10.0 |

---

## 九、一图总结：每个技术在 Snow 里的角色

```
┌────────────────────────────────────────────────────┐
│  用户请求到达                                        │
│                                                      │
│  Supabase Auth → 验证用户身份                        │
│       ↓                                              │
│  Upstash Redis → 读取情绪状态、关系缓存（极快）       │
│       ↓                                              │
│  Supabase PG + pgvector → 检索相关记忆（语义搜索）    │
│       ↓                                              │
│  Drizzle ORM → 类型安全地操作数据库                  │
│       ↓                                              │
│  Vercel AI SDK → 编排 Prompt → 调用 DeepSeek → 流式回复│
│       ↓                                              │
│  Upstash QStash → 异步触发记忆写入和关系更新          │
│       ↓                                              │
│  Supabase Realtime → 主动消息实时推送（M2+）          │
└────────────────────────────────────────────────────┘
```

| 技术 | 一句话角色 |
|------|-----------|
| **Supabase** | Snow 的"大脑"——存储关于用户的一切知识和记忆 |
| **pgvector** | Snow 的"联想能力"——从记忆中找到和当前话题相关的东西 |
| **Drizzle ORM** | 开发者的"翻译官"——类型安全地操作数据库 |
| **Upstash Redis** | Snow 的"短期工作台"——快速存取当前情绪、会话状态 |
| **Upstash QStash** | Snow 的"小秘书"——主线程忙完后，安排后台做记忆整理 |
| **Vercel AI SDK** | Snow 的"多模型遥控器"——统一接口调用任何 LLM |
| **DeepSeek V3** | Snow 的"大脑皮层"——理解和生成有感情的对话 |
| **Next.js 15** | Snow 的"身体"——前后端一体，承载所有交互 |

---

## 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-03-30 | v0.1 | 初稿：完整技术选型方案 |
| 2026-03-30 | v0.2 | 补充每个技术的详细讲解（是什么、为什么、代码示例）；补充 Vercel 存储历史说明 |
| 2026-03-31 | v0.4 | Embedding 方案确认：OpenAI text-embedding-3-small via OpenRouter，1536 维；安装 @ai-sdk/openai |

---

*最好的技术选型不是选最强的，是选最合适的。*
