# Batch 6 完成报告

> 日期：2026-04-09  
> 状态：✅ 全部验证通过

---

## 目标

实现 Snow 的情绪系统，让她的当前回复能被情绪影响，并且在会话结束后保留情绪延续性。

---

## 做了什么

### 1. 新增文件

| 文件 | 作用 |
|------|------|
| `packages/core/src/emotion/engine.ts` | 情绪引擎：热状态读取、冷恢复、EMA 平滑、强事件突变 |
| `packages/core/src/db/queries/emotion.ts` | `emotion_states` / `emotion_trends` 查询封装 |
| `packages/core/src/prompts/emotion-evaluation.ts` | 情绪分析 Prompt |
| `packages/core/src/prompts/emotion-trend-summary.ts` | 情绪趋势摘要归纳 Prompt |
| `packages/core/scripts/test/test-emotion.ts` | Batch 6 端到端验证脚本 |
| `drizzle/0005_military_sleeper.sql` | 新增 `emotion_trends` 表的迁移文件 |

### 2. 修改的文件

| 文件 | 变更 |
|------|------|
| `packages/core/src/ai/chat.ts` | 在当前轮回复前接入情绪更新 |
| `packages/core/src/ai/prompts/composer.ts` | 支持注入“当前情绪 + 趋势摘要” |
| `packages/core/src/prompts/emotion-guidance.ts` | 补充 `annoyed`，支持趋势摘要层 |
| `packages/core/src/db/queries/redis-store.ts` | 新增 `snow:emotion:state:*` / `snow:emotion:trend:*` 读写 |
| `packages/core/src/db/schema.ts` | 新增 `emotion_trends` 表 |
| `packages/core/src/memory/persist-summary.ts` | 持久化对话摘要时同步写入情绪快照 |
| `packages/core/src/scheduler/task-scheduler.ts` | idle 任务增加情绪快照持久化与趋势摘要刷新 |
| `packages/core/src/index.ts` | 导出情绪模块 API |
| `packages/core/scripts/test/test-utils.ts` | 测试清理逻辑新增情绪相关表和 Redis key |
| `packages/core/scripts/test/test-chat.ts` | 修复延时任务导入路径 |
| `package.json` | 新增 `test:emotion` |

---

## 关键设计落地

### 1. 当前情绪状态

- Redis 热 key：`snow:emotion:state:{platform}:{platformId}`
- 优先读取 Redis
- Redis miss 时，从 `emotion_states` 最新一条恢复
- 恢复时会根据时间和亲密度做衰减

### 2. 情绪输入上下文

情绪引擎不是只看当前一句消息，而是综合：

- 当前消息
- 当前情绪
- `context_summary`
- `unextracted`
- 最近一次趋势摘要

这样 LLM 能更准确理解语境，而不是只靠单句猜测。

### 3. 会话结束后的处理

30 分钟无新消息时：

1. 持久化当前情绪快照到 `emotion_states`
2. 基于最近情绪快照由 LLM 生成 1-2 句趋势摘要
3. 趋势摘要写入 `emotion_trends`
4. 热缓存同时更新到 Redis

---

## 验证结果

执行：

```bash
pnpm --filter @snow/core typecheck
pnpm run db:generate
pnpm run db:migrate
pnpm run test:emotion
```

验证通过，关键结果：

- 低落消息可触发 `worried`
- 好消息可从 `worried` 切换到 `happy`
- 会话结束后可以生成趋势摘要
- 测试清理后，PG 与 Redis 均无残留

---

## 遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 情绪测试首次失败 | 缺少 `emotion_trends` 表 | 生成并执行 Drizzle migration |
| 初版切换过于保守 | 从 `worried` 收到好消息后没有转成 `happy` | 调整非冲击状态下的切换阈值 |
| ESLint 无法执行 | 项目未安装 `eslint` | 保留为当前缺口，已完成 TS 检查 |

---

## 当前结果

Batch 6 现在已经实现：

- 当前轮情绪实时计算
- Redis 热状态缓存
- `emotion_states` 冷恢复基线
- `emotion_trends` 趋势摘要
- idle 后的异步情绪持久化

这意味着 Snow 已经具备：

- 有情绪
- 情绪会影响当前回复
- 情绪可以跨会话延续

---

## 下一步

Batch 7：用户自定义 + 完整循环。

