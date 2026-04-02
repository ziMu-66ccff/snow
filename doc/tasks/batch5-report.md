# Batch 5 完成报告

> 日期：2026-04-02  
> 状态：✅ 全部验证通过

---

## 目标

Snow 对不同用户态度不同，基于多维信号动态评估关系。

---

## 做了什么

### 1. 新增文件

| 文件 | 作用 |
|------|------|
| `core/src/relation/evaluator.ts` | LLM 分析对话中的 4 维关系信号（generateObject + zod） |
| `core/src/relation/updater.ts` | 加权计算亲密度 + 时间衰减 + 降级保护 + 写 DB + 更新 Redis 缓存 |
| `core/src/memory/extract.ts` | 独立的记忆提取函数（从旧 extract-task 拆出） |
| `core/src/memory/persist-summary.ts` | 独立的摘要持久化函数（从旧 extract-task 拆出） |
| `core/src/scheduler/task-scheduler.ts` | 跨模块任务编排层（替代旧 extract-task） |
| `core/src/scheduler/delayed-task.ts` | 延时任务管理（从 memory/ 移到 scheduler/） |
| `core/scripts/test-relation.ts` | Batch 5 验证脚本 |
| `doc/tech/modules/relation-system.md` | 关系系统技术文档 |

### 2. 修改的文件

| 文件 | 变更 |
|------|------|
| `core/src/ai/chat.ts` | import 路径更新（scheduler/），函数名更新 |
| `core/src/index.ts` | 新增 relation + scheduler 导出 |
| `core/scripts/test-chat.ts` | 函数名更新 |
| `package.json` | 新增 `script:test-relation` 命令 |
| `doc/tasks/m1-tasks.md` | Batch 5 标记完成 |

### 3. 删除的文件

| 文件 | 原因 |
|------|------|
| `core/src/memory/extract-task.ts` | 拆分为 extract.ts + persist-summary.ts + task-scheduler.ts |
| `core/src/memory/task-scheduler.ts` | 移到 scheduler/ 目录 |
| `core/src/memory/delayed-task.ts` | 移到 scheduler/ 目录 |

### 4. 关系评估流程

```
getChatResponse onFinish
  → push Redis unextracted
  → 每 5 轮触发 executePeriodicTasks：
      1. 取 Redis 数据（unextracted + context_summary）
      2. runMemoryExtraction（记忆提取）
      3. updateRelation（关系评估）
         a. owner → 跳过
         b. LLM 分析 4 维信号（+ 上下文摘要）
         c. 代码计算 timespan
         d. 时间衰减
         e. 加权更新亲密度
         f. 判定阶段
         g. 写 PG + 更新 Redis 缓存

  → 延时 30 分钟触发 executeIdleTasks：
      同上 + 持久化摘要 + GC
```

### 5. 关系评估参数

| 参数 | 值 |
|------|------|
| 权重 | 深度 25% + 情感 25% + 信任 25% + 频率 15% + 时间 10% |
| 升级学习率 | 0.1 |
| 降级学习率 | 0.033（升级的 1/3） |
| 恢复加速 | 0.15（曾经亲密的用户） |
| 最低保底 | intimacyScore = 5 |
| GC 阈值 | vividness < 0.02 |

### 6. 目录重组

```
src/
├── ai/           ← LLM 调用、Prompt 编排
├── memory/       ← 记忆相关（extract, writer, retriever, extractor, gc, summarizer, persist-summary）
├── relation/     ← 关系相关（evaluator, updater）
├── scheduler/    ← 跨模块任务编排（task-scheduler, delayed-task）
└── db/           ← 数据访问层
```

---

## 验证结果

```
📊 测试 1：LLM 关系信号分析（温暖对话）
   互动频率: 0.40  ✅ 正向
   对话深度: 0.30  ✅ 正向
   情感浓度: 0.50  ✅ 正向
   信任信号: 0.40  ✅ 正向

📊 测试 2：亲密度更新
   更新前：intimacy=0, stage=stranger
   第一轮后：intimacy=5, stage=stranger  ✅ 提升
   第二轮后：intimacy=9, stage=stranger  ✅ 继续提升

📊 测试 3：owner 保护
   skipped=true, intimacy=100  ✅ 不变

📊 测试 4：冷淡对话信号分析
   互动频率: -0.30  ✅ 负向
   对话深度: -0.20  ✅ 负向
   情感浓度: -0.30  ✅ 负向
   信任信号: 0.00   ✅ 无信号

🗑️ 测试数据已自动清理
```

---

## 遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `column users.user_id does not exist` | updater.ts 查 users 表时用了 userRelations 的列 | 改为 `eq(users.id, userId)` |
| extractMemories 名字冲突 | extractor.ts 和 extract.ts 都叫这个名 | extract.ts 改名为 `runMemoryExtraction` |
| 关系评估缺上下文 | evaluator 只收对话没收摘要 | 加 contextSummary 参数 |

---

## 可运行的命令

```bash
cd /Users/zimu/ai/snow

pnpm run script:chat              # 交互式聊天
pnpm run script:test-chat         # 测试对话 + 人设
pnpm run script:test-memory-write # 测试记忆写入
pnpm run script:test-memory-retrieval # 测试记忆检索
pnpm run script:test-relation     # 测试关系系统
pnpm run script:gc-memories       # 手动 GC
```

---

## 下一步

**Batch 6：情绪系统** — 实现情绪引擎，让 Snow 有情绪变化。
