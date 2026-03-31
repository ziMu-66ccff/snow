# Batch 4 完成报告

> 日期：2026-03-31  
> 耗时：约 30 分钟  
> 状态：✅ 全部验证通过

---

## 目标

Snow 能跨会话记住之前聊过的事。

---

## 做了什么

### 1. 新增文件

| 文件 | 作用 |
|------|------|
| `core/src/memory/vividness.ts` | 鲜活度模型：importance × 时间衰减 × 强化系数 × 情感加成 × 关系加成 |
| `core/src/memory/retriever.ts` | 记忆检索器：必选池（事实+摘要）+ 动态池（pgvector × 鲜活度） |
| `core/src/memory/summarizer.ts` | 对话摘要生成：LLM 生成摘要 → 写入 conversations 表 |
| `core/src/db/queries/memory-read.ts` | DB 查询：事实检索、pgvector 搜索、记忆强化、对话记录写入 |
| `core/scripts/test-memory-retrieval.ts` | Batch 4 自动化验证脚本（含自动清理） |

### 2. 修改的文件

| 文件 | 变更 |
|------|------|
| `core/scripts/chat.ts` | 每条消息前检索记忆注入 Prompt；退出时保存记忆 + 生成摘要 |
| `core/src/index.ts` | 新增 retriever / vividness / summarizer 导出 |
| `package.json`（根） | 新增 `script:test-memory-retrieval` 命令 |

### 3. 记忆检索流程（两池策略）

```
用户发来消息
    │
    ├── 必选池（每次都带）
    │   ├── 用户基本事实（factual_memories）
    │   └── 上次对话摘要（conversations）
    │
    └── 动态池（按话题检索）
        ├── 向量化用户消息 → queryVec
        ├── pgvector 搜索 top 20 候选
        ├── 最终得分 = 相似度 × 0.5 + 鲜活度 × 0.5
        ├── 取 top 5 注入 Prompt
        └── 被选中的记忆 accessCount++（强化）
```

### 4. 鲜活度模型

```
鲜活度 = importance × timeDecay × reinforcement × emotionBoost × relationBoost
```

- 时间衰减：半衰期 30/180 天，保底 0.05（可唤醒）
- 强化系数：被检索次数越多越牢
- 情感加成：情绪强烈的记忆更深刻
- 关系加成：亲密用户记得更多

### 5. chat 脚本完整流程

```
启动 → 查 DB 获取身份
每条消息：
  1. 检索记忆（必选池 + 动态池）
  2. 注入 Prompt（基础人设 + 关系层 + 记忆层）
  3. LLM 流式回复
退出（Ctrl+C）：
  1. 提取并保存记忆（事实 + 语义）
  2. 生成并保存对话摘要
```

---

## 验证结果

```
═══════════════════════════════════════
📝 第一轮对话：告诉 Snow 信息
═══════════════════════════════════════

用户: 我叫李四，在北京做后端开发
用户: 下周三有个技术分享要做
用户: 讲微服务架构，有点紧张

💾 事实：5 条写入
📋 摘要：用户介绍了职业和技术分享安排，Snow 表达了关心和鼓励

═══════════════════════════════════════
🔍 第二轮对话：验证 Snow 还记得
═══════════════════════════════════════

> 你好，我上次跟你说的事怎么样了

📦 检索到的记忆：
   基本事实：name: 李四, city: 北京, occupation: 后端开发
   上次摘要：用户介绍了职业和技术分享安排...
   动态记忆：用户下周三有技术分享，主题是微服务架构，对此感到紧张

Snow: 主人~ 你是指下周三的技术分享吗？
     我一直在想这件事呢… 紧张的心情有没有好一点？

🗑️  测试数据已自动清理
🎉 全部通过！
```

---

## 遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `results.rows` undefined | Drizzle + postgres.js 的 `execute` 返回数组不是 `{rows}` | 兼容处理：`Array.isArray(results) ? results : results.rows` |
| `cannot cast record to uuid[]` | raw SQL 的 `ANY($1::uuid[])` 参数传递问题 | 改用 Drizzle 的 `inArray` 操作符 |
| 验证脚本污染真实数据 | 旧脚本用 zimu 用户写测试数据，清理时删掉真实记忆 | 创建 `test-utils.ts` 公共工具，所有验证脚本使用独立临时测试用户（`platform=__test__`），finally 块确保清理 |
| 检索算法值域不匹配 | 相似度 0-1，鲜活度可 >1，直接加权不公平 | 改为两阶段筛选：门槛过滤 + 归一化鲜活度；候选池 20→50；注入上限 5→8；权重 6:4 |

---

## 可运行的命令

```bash
cd /Users/zimu/ai/snow

# 交互式聊天（带记忆检索 + 退出时保存）
pnpm run script:chat

# 验证记忆写入
pnpm run script:test-memory-write

# 验证记忆检索（跨会话）
pnpm run script:test-memory-retrieval
```

---

## 下一步

**Batch 5：关系系统** — 实现关系信号分析和更新，让 Snow 对不同用户态度不同。
