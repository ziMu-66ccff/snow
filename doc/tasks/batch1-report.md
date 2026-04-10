# Batch 1 完成报告

> 日期：2026-03-30  
> 耗时：约 15 分钟  
> 状态：✅ 全部验证通过
> 说明：本报告反映 Batch 1 当时的初始 schema。当前 M1 代码已移除 `personality_customizations` / `personality_adjustments`，请以最新 `schema.ts` 和 `database-schema.md` 为准。

---

## 目标

搭建 monorepo 项目骨架，创建数据库所有表，验证各服务连通性。

---

## 做了什么

### 1. 项目初始化（monorepo）

创建了以下根文件：

| 文件 | 作用 |
|------|------|
| `package.json` | 根包配置，定义脚本命令 |
| `pnpm-workspace.yaml` | pnpm workspace 配置，声明 packages/* |
| `tsconfig.json` | TypeScript 配置，含 `@snow/core` 路径别名 |
| `.gitignore` | Git 忽略规则（含 .env.local） |
| `.env.local` | 真实环境变量（不提交 Git） |
| `.env.example` | 环境变量模板（安全提交） |
| `drizzle.config.ts` | Drizzle Kit 配置（指向 core schema） |

### 2. 创建 @snow/core 包

```
packages/core/
├── package.json         ← 包名 @snow/core，声明依赖
├── tsconfig.json        ← 继承根 tsconfig
├── src/
│   ├── index.ts         ← 统一导出入口
│   ├── db/
│   │   ├── schema.ts    ← Drizzle 表结构定义（8 张表）
│   │   ├── client.ts    ← PostgreSQL 连接（Drizzle + postgres.js）
│   │   └── redis.ts     ← Upstash Redis 客户端
│   ├── ai/              ← 目录已创建，Batch 2 填充
│   │   └── prompts/
│   ├── memory/          ← 目录已创建，Batch 3-4 填充
│   ├── emotion/         ← 目录已创建，Batch 6 填充
│   ├── relation/        ← 目录已创建，Batch 5 填充
│   └── types/           ← 目录已创建
└── scripts/             ← 验证脚本（core 内部）
    ├── init-db.ts
    ├── seed.ts
    └── test-db.ts
```

### 3. 数据库 Schema（8 张表）

在 `packages/core/src/db/schema.ts` 中定义了以下表：

| 表名 | 用途 | 字段数 | 索引 |
|------|------|--------|------|
| `users` | 用户基本信息 | 7 | — |
| `personality_customizations` | 性格自定义（自然语言） | 6 | unique(user_id) |
| `personality_adjustments` | 聊天中的性格调整记录 | 6 | — |
| `user_relations` | 关系模型（多维评估） | 15 | unique(user_id) |
| `factual_memories` | 事实记忆（key-value） | 9 | unique(user_id, category, key) + idx(user_id) |
| `semantic_memories` | 语义记忆（向量化） | 9 | idx(user_id)，向量列 1024 维 |
| `conversations` | 对话记录 + 摘要 | 7 | idx(user_id) |
| `emotion_states` | 情绪状态历史 | 7 | idx(user_id, created_at) |

### 4. 数据库操作

| 操作 | 结果 |
|------|------|
| 启用 pgvector 扩展 | ✅ `CREATE EXTENSION IF NOT EXISTS vector` |
| 生成迁移文件 | ✅ `drizzle/0000_empty_ozymandias.sql` |
| 执行迁移 | ✅ 8 张表全部创建成功 |
| 种子数据 | ✅ zimu 用户（owner / intimate / 100） |

### 5. 验证脚本

| 脚本 | 作用 | 结果 |
|------|------|------|
| `packages/core/scripts/init-db.ts` | 启用 pgvector + 测试连接 | ✅ |
| `packages/core/scripts/seed.ts` | 插入 zimu 作为 owner | ✅ |
| `packages/core/scripts/test-db.ts` | 查询用户 + 关系 + Redis + 表列表 | ✅ |

### 6. 安装的依赖

**根（devDependencies）**：
- `drizzle-kit` — 数据库迁移工具
- `tsx` — 直接运行 TypeScript 脚本
- `typescript` / `@types/node`

**@snow/core（dependencies）**：
- `ai` — Vercel AI SDK
- `@ai-sdk/deepseek` — DeepSeek 模型提供商
- `drizzle-orm` — ORM
- `postgres` — PostgreSQL 驱动
- `@upstash/redis` — Redis 客户端
- `@upstash/qstash` — 异步任务队列
- `zod` — Schema 验证
- `dotenv` — 环境变量加载

---

## 验证结果

```
🔍 Testing database connection...

✅ User found:
   Name: zimu
   ID: 5896d0af-8d6b-4c4a-9075-3dc1da0085cf
   Platform: system
   Created: 2026-03-30T10:52:08.977Z

✅ Relation found:
   Role: owner
   Stage: intimate
   Intimacy: 100

🔍 Testing Redis connection...
✅ Redis: hello from snow

🔍 Checking tables...
✅ Tables: conversations, emotion_states, factual_memories, 
          personality_adjustments, personality_customizations, 
          semantic_memories, user_relations, users

🎉 All tests passed!
```

---

## 遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `ENOTFOUND db.xxx.supabase.co` | Supabase direct URL DNS 解析不到 | 改用 pooler 地址（`aws-1-ap-southeast-1.pooler.supabase.com:6543`） |
| `dotenv` 加载不到 `.env.local` | 默认只加载 `.env` | 改用 `config({ path: '.env.local' })` |

---

## 可运行的命令

```bash
cd /Users/zimu/ai/snow

pnpm run db:generate     # 生成迁移文件
pnpm run db:migrate      # 执行迁移
pnpm run db:seed         # 插入种子数据
pnpm run script:test-db  # 验证数据库 + Redis
```

---

## 下一步

**Batch 2：LLM 对话 + 基础人设** — 接入 DeepSeek，写 Snow 的人设 Prompt，实现命令行聊天。
