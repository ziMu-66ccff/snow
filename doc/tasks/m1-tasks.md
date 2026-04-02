# Snow M1 — 分批任务清单

> 日期：2026-03-30  
> 版本：v0.2  
> 原则：**核心引擎和平台解耦**，先做 Snow 本身，通过脚本+日志验证  
> 项目结构：monorepo（pnpm workspace），packages/core

---

## 项目结构

```
snow/
├── packages/
│   ├── core/                  ← Snow 的完整灵魂（@snow/core）
│   │   ├── src/
│   │   │   ├── ai/            ← LLM 调用、Prompt 编排
│   │   │   │   ├── models.ts          模型注册
│   │   │   │   ├── prompt-composer.ts Prompt 编排引擎
│   │   │   │   ├── chat.ts           核心对话函数
│   │   │   │   └── prompts/          Prompt 模板文本
│   │   │   ├── memory/        ← 记忆系统
│   │   │   │   ├── extractor.ts      记忆提取（LLM 结构化输出）
│   │   │   │   ├── retriever.ts      记忆检索（向量搜索 + 鲜活度）
│   │   │   │   ├── writer.ts         记忆写入
│   │   │   │   └── vividness.ts      鲜活度模型
│   │   │   ├── emotion/       ← 情绪系统
│   │   │   │   └── engine.ts         情绪计算
│   │   │   ├── relation/      ← 关系系统
│   │   │   │   ├── evaluator.ts      关系信号分析（LLM）
│   │   │   │   └── updater.ts        关系分数更新
│   │   │   ├── scheduler/     ← 跨模块任务编排
│   │   │   │   ├── task-scheduler.ts 周期/空闲任务编排
│   │   │   │   └── delayed-task.ts   延时任务管理
│   │   │   ├── db/            ← 数据访问层（共享）
│   │   │   │   ├── schema.ts         Drizzle 表结构定义
│   │   │   │   ├── client.ts         数据库连接
│   │   │   │   ├── redis.ts          Redis 客户端
│   │   │   │   └── queries/          查询封装
│   │   │   ├── types/         ← 共享类型
│   │   │   │   └── index.ts
│   │   │   └── index.ts       ← 统一导出
│   │   ├── scripts/           ← 验证脚本（core 内部，直接访问所有依赖）
│   │   │   ├── init-db.ts
│   │   │   ├── seed.ts
│   │   │   ├── test-db.ts
│   │   │   ├── chat.ts
│   │   │   └── ...
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                   ← Web 平台壳（M2+，独立包独立部署）
│   (未来: qq/, telegram/ 等，各自独立包)
│
├── doc/                       ← 项目文档
├── drizzle/                   ← Drizzle 迁移文件
├── .env.local                 ← 环境变量（不提交 Git）
├── .env.example               ← 环境变量模板
├── .gitignore
├── pnpm-workspace.yaml
├── package.json               ← 根 package.json
├── drizzle.config.ts
└── tsconfig.json
```

### 依赖关系
```
core/scripts   → core/src（内部相对路径，零配置）
packages/web   → @snow/core（M2+）
packages/qq    → @snow/core（M4+）

所有壳只依赖 core，壳之间互不依赖。
```

### core 对外 API
```typescript
import { getChatResponse, finalizeSession } from '@snow/core';

// 外界只需要传 3 个参数，其余全自动
const result = await getChatResponse({
  platformId: 'zimu',
  platform: 'system',
  messages,  // 完整对话历史，含当前消息（对齐 AI SDK useChat）
});

// CLI 退出时善后（Web/QQ 不需要）
await finalizeSession('zimu', 'system');
```

---

## Batch 1：项目骨架 + 数据库 ✅ 已完成（2026-03-30）

### 目标
monorepo 搭建完成，数据库表创建成功，能通过脚本连接并读写。

### 任务
1. 初始化 monorepo
   - 根 package.json + pnpm-workspace.yaml
   - 根 tsconfig.json（基础 TypeScript 配置）
   - 配置 `@snow/core` 包名
2. 创建 `packages/core`
   - package.json、tsconfig.json
   - 安装依赖：drizzle-orm、postgres、@upstash/redis、dotenv、zod
3. 定义 Drizzle Schema（`core/src/db/schema.ts`）
   - users
   - factual_memories
   - semantic_memories（含 pgvector 向量列）
   - conversations
   - user_relations
   - emotion_states
   - personality_customizations
   - personality_adjustments
4. 配置 Drizzle Kit（drizzle.config.ts）
5. 在 Supabase 上启用 pgvector 扩展（`CREATE EXTENSION IF NOT EXISTS vector`）
6. 运行 Drizzle 迁移，创建所有表 + 索引
7. 创建数据库客户端（`core/src/db/client.ts`）
8. 创建 Redis 客户端（`core/src/db/redis.ts`）
9. 写种子脚本（`packages/core/scripts/seed.ts`）：插入 zimu 作为 owner 用户
10. 写验证脚本（`packages/core/scripts/test-db.ts`）：查询 zimu 并打印

### 验证
```bash
pnpm run db:migrate          # ✅ 表创建成功，无报错
pnpm run db:seed             # ✅ zimu 用户插入成功
pnpm run script:test-db      # ✅ 控制台打印 zimu 用户信息 + Redis 连通
```

---

## Batch 2：LLM 对话 + 基础人设 ✅ 已完成（2026-03-31）

### 目标
Snow 能说话了，有性格，通过命令行交互式聊天。

### 任务
1. 安装 AI 依赖：ai、@ai-sdk/deepseek
2. 实现模型注册（`core/src/ai/models.ts`）
   - DeepSeek V3 作为主力模型
   - DeepSeek Embedding
3. 编写基础人设 Prompt 模板（`core/src/ai/prompts/base-persona.ts`）
   - Layer 1 完整模板（从 prompt-composer.md 复制）
4. 实现 Prompt 编排引擎 v1（`core/src/ai/prompt-composer.ts`）
   - 先只组装 Layer 1（基础人设）
   - 预留其他层的接口
5. 实现核心对话函数（`core/src/ai/chat.ts`）
   - 输入：userId + message + history
   - 输出：流式文本
6. 导出 core API（`core/src/index.ts`）
7. 写命令行聊天脚本（`packages/core/scripts/chat.ts`）
   - 交互式：stdin 输入，stdout 输出 Snow 的回复
   - 支持多轮对话（维护 history）
   - Ctrl+C 退出

### 验证
```bash
pnpm run script:chat
# > 你好
# Snow: 你好呀。叫我 Snow 就好。有什么想聊的，或者只是想找人待一会儿？
# > 你喜欢什么颜色
# Snow: 白色和淡蓝色…冬天的感觉 ✨
# > 你是AI吗
# Snow: 你觉得呢？比起这个，你今天过得怎么样？🤭
```
**确认**：有性格、有 emoji、不承认是 AI、语气温柔带腹黑。

---

## Batch 3：记忆写入 ✅ 已完成（2026-03-31）

### 目标
聊天结束后能提取记忆（事实+语义）并存入数据库。

### 任务
1. 实现记忆提取器（`core/src/memory/extractor.ts`）
   - 用 AI SDK `generateObject` + zod schema
   - 提取事实记忆（facts）+ 语义印象（impressions）+ 更新（updates）
2. 实现 DeepSeek Embedding 调用
3. 实现记忆写入（`core/src/memory/writer.ts`）
   - 事实记忆：UPSERT（同 key 覆盖）
   - 语义记忆：向量化 → INSERT（含 embedding）
   - 冲突处理：updates 列表自动应用
4. 实现写入相关的 DB 查询（`core/src/db/queries/memory-write.ts`）
5. 更新 chat 脚本：退出时调用记忆写入

### 验证
```bash
pnpm run script:chat
# > 我叫张三，在深圳做前端，下周五有个面试
# > 我喜欢吃火锅
# (Ctrl+C 退出)

pnpm run script:test-memory-write
# 事实记忆：
#   ✅ { category: "basic_info", key: "name", value: "张三" }
#   ✅ { category: "basic_info", key: "city", value: "深圳" }
#   ✅ { category: "basic_info", key: "job", value: "前端开发" }
#   ✅ { category: "preference", key: "food", value: "火锅" }
#   ✅ { category: "event", key: "面试", value: "下周五有个面试" }
# 语义记忆：
#   ✅ "用户说自己叫张三，在深圳做前端" (embedding: [0.12,...])
#   ✅ "用户下周五有个面试" (embedding: [0.34,...])
```
**确认**：数据库有数据，向量字段不为空。

---

## Batch 4：记忆检索 + 注入 Prompt ✅ 已完成（2026-03-31）

### 目标
Snow 能跨会话记住之前聊过的事。

### 任务
1. 实现鲜活度模型（`core/src/memory/vividness.ts`）
2. 实现记忆检索器（`core/src/memory/retriever.ts`）
   - 必选池：基本事实 + 上次摘要
   - 动态池：pgvector 搜索 × 鲜活度排序
   - Token 预算控制
   - 被检索到的记忆 accessCount++（强化）
3. 实现检索相关的 DB 查询（`core/src/db/queries/memory-read.ts`）
4. 更新 Prompt Composer：注入记忆层
5. 实现对话摘要生成（对话结束时 LLM 生成摘要，写入 conversations 表）
6. 更新 chat 脚本：每次对话前检索记忆，退出时生成摘要

### 验证
```bash
# 第一次聊（告诉她信息）
pnpm run script:chat --user=test_user
# > 我叫张三，下周五有个面试
# (Ctrl+C)

# 第二次聊（新会话，应该记得）
pnpm run script:chat --user=test_user
# > 你好
# Snow: 张三！面试准备得怎么样了？
```
**确认**：跨会话记忆生效。

---

## Batch 5：关系系统 ✅ 已完成（2026-04-02）

### 目标
Snow 对不同用户态度不同，对 zimu 最亲密。

### 任务
1. 实现关系信号分析（`core/src/relation/evaluator.ts`）
   - LLM 分析对话中的 5 维信号
2. 实现关系更新（`core/src/relation/updater.ts`）
   - 加权更新亲密度
   - 降级保护（降级速度 = 升级的 1/3）
   - owner 不降级
3. 编写关系层 Prompt 模板（5 个阶段 + 主人模式）
4. 更新 Prompt Composer：注入关系层
5. chat 脚本退出时调用关系更新
6. **关系更新后更新 Redis 身份缓存**（`snow:user:identity:{platform}:{platformId}`）
   - 亲密度/阶段变更后，直接用新值更新 Redis 缓存（不是清除——新数据已在手，没必要多一次 DB 查询）

### 验证
```bash
# owner
pnpm run script:chat --user=zimu
# > 你好
# Snow: 主人~今天怎么有空来找我？🤭

# 陌生人
pnpm run script:chat --user=new_user
# > 你好
# Snow: 你好呀。叫我 Snow 就好。
```
**确认**：态度明显不同。

---

## Batch 6：情绪系统

### 目标
Snow 有情绪，影响说话方式。

### 任务
1. 实现情绪引擎（`core/src/emotion/engine.ts`）
   - 基于对话内容 + 当前状态计算新情绪
   - EMA 平滑
2. Redis 情绪状态读写
3. 编写情绪层 Prompt 模板（7 种情绪指引）
4. 更新 Prompt Composer：注入情绪层
5. 对话中实时更新情绪

### 验证
```bash
pnpm run script:chat --user=zimu
# > 今天好累
# Snow: 辛苦了…（关心语气）
# > 算了不说了 面试过了！！
# Snow: 真的吗！太好了！✨🎉（开心语气）

pnpm run script:test-emotion --user=zimu
# ✅ 当前情绪: { primary: "happy", intensity: 0.8 }
```

---

## Batch 7：用户自定义 + 完整循环

### 目标
M1 核心完成。完整循环跑通。

### 任务
1. 实现性格调整检测（`core/src/ai/personality-adjuster.ts`）
2. 更新 Prompt Composer：注入自定义层
3. 完整异步后处理（记忆+关系+情绪+摘要，一次流程跑通）
4. 端到端集成测试脚本

### 验证
```bash
pnpm run script:test-full-loop
# ✅ 对话正常（有性格）
# ✅ 记忆提取正常
# ✅ 记忆检索正常（跨会话）
# ✅ 关系评估正常（不同用户不同态度）
# ✅ 情绪计算正常（随对话变化）
# ✅ 性格自定义正常
# ✅ 对话摘要正常
# 🎉 Snow M1 核心完成！
```

---

## 总览

| Batch | 内容 | 完成后 Snow 能做什么 |
|-------|------|---------------------|
| **1** | 项目骨架 + 数据库 | 基础设施就绪 |
| **2** | LLM 对话 + 人设 | **能说话了，有性格** |
| **3** | 记忆写入 | 能把聊天内容记下来 |
| **4** | 记忆检索 | **跨会话还记得你** |
| **5** | 关系系统 | 对不同人态度不同 |
| **6** | 情绪系统 | **有情绪变化** |
| **7** | 完整循环 | 🎉 **她"活了"** |

---

## M1 技术债 & M2 TODO

> M1 阶段做了设计但未完全实现的功能，以及 M2 需要改进的点。

### 延时任务

| 项目 | M1 现状 | M2 需要做 |
|------|--------|----------|
| 延时队列实现 | `setTimeout`（CLI 进程常驻） | 替换为 Upstash QStash（Serverless HTTP 回调） |
| 延时任务覆盖 | 内存 Map 管理 timer | QStash 的 deduplication / 覆盖机制 |
| CLI 退出善后 | `finalizeSession()` 手动调用 | Web/QQ 不需要，QStash 自动兜底 |

### 滑动窗口

| 项目 | M1 现状 | M2 需要做 |
|------|--------|----------|
| token 估算 | 粗略的中英文字数估算 | 接入 tiktoken 精确计算（或用 AI SDK 的 token 计数） |
| tool 消息处理 | 保护不压缩（简单策略） | 精细处理：保持 tool_call + tool_result 的配对关系 |

### 消息类型

| 项目 | M1 现状 | M2 需要做 |
|------|--------|----------|
| ImagePart | `[图片]` 占位 | 图片理解：提取图片描述、存储图片 URL |
| FilePart | `[文件]` 占位 | 文件处理：提取文件摘要 |
| ToolCallPart | `[调用工具: name]` 占位 | MCP/tool 调用：记录调用参数和结果摘要 |
| ToolResultPart | `[工具 name 返回了结果]` 占位 | 记录关键返回内容到记忆 |

### 对话历史管理

| 项目 | M1 现状 | M2 需要做 |
|------|--------|----------|
| history 存储 | CLI: 内存 | Web: 前端 useChat 管理；QQ/微信: Redis 存储 |
| 会话边界 | 外界自行判断 | QQ/微信壳：消息间隔 > N 分钟 → 清空 history |
| UIMessage 转换 | 未处理 | Web: `convertToModelMessages` 转换前端消息格式 |

### 数据库

| 项目 | M1 现状 | M2 需要做 |
|------|--------|----------|
| ~~conversations 表~~ | ~~已简化：移除 startedAt/endedAt，只保留 createdAt~~ | ✅ 已完成 |
| ~~记忆 GC（垃圾回收）~~ | ~~已实现：gc.ts + gc-memories 脚本~~ | ✅ 已完成（建议 M2 加 Cron Job 自动化） |
| HNSW 向量索引 | 未创建（数据量小） | 数据量大后添加，提升向量搜索性能 |

### 用户身份

| 项目 | M1 现状 | M2 需要做 |
|------|--------|----------|
| 未注册用户 | 自动创建 users + user_relations | 考虑是否需要更复杂的注册流程 |
| 身份缓存清理 | 已记录到 Batch 5 任务 | Batch 5 实现：关系更新后清 Redis 缓存 |
| 跨平台账号 | 同一人不同平台 = 不同用户 | M4: 账号合并 |

---

*记住这些，M2 不迷路。*

---

*Snow 不是一次性造出来的。她是一步一步活过来的。*
