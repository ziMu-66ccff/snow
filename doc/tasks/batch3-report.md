# Batch 3 完成报告

> 日期：2026-03-31  
> 耗时：约 25 分钟  
> 状态：✅ 全部验证通过

> 说明（后续变更）：本报告记录的是 2026-03-31 当时实现。当前主分支已切换为 `baai/bge-m3`（1024 维）作为 embedding 模型，请以 `packages/core/src/ai/models.ts` 与 `packages/core/src/db/schema.ts` 为准。

---

## 目标

聊天结束后能提取记忆（事实 + 语义）并存入数据库。

---

## 做了什么

### 1. Embedding 模型接入

- **Provider**：OpenRouter（兼容 OpenAI 接口）
- **模型**：`openai/text-embedding-3-small`（1536 维）
- **包**：安装 `@ai-sdk/openai`，通过 `createOpenAI({ baseURL: 'https://openrouter.ai/api/v1' })` 接入
- **维度变更**：`semantic_memories.embedding` 从 1024 维升级为 1536 维，已执行 migration

### 2. 新增文件

| 文件 | 作用 |
|------|------|
| `core/src/memory/extractor.ts` | 记忆提取器：用 AI SDK `generateObject` + zod schema 从对话中提取事实 + 印象 + 更新 |
| `core/src/memory/writer.ts` | 记忆写入主流程：提取 → 写入事实（UPSERT）→ 处理更新 → 向量化写入语义记忆 |
| `core/src/db/queries/memory-write.ts` | 数据库查询：事实 UPSERT + 语义 INSERT + 查询已有事实 |
| `core/scripts/test-memory-write.ts` | Batch 3 自动化验证脚本 |

### 3. 修改的文件

| 文件 | 变更 |
|------|------|
| `core/src/ai/models.ts` | 新增 `getEmbeddingModel()`（OpenRouter + text-embedding-3-small） |
| `core/src/db/schema.ts` | `semantic_memories.embedding` 维度 1024 → 1536 |
| `core/src/index.ts` | 新增 memory 模块导出 |
| `core/scripts/chat.ts` | 退出时自动调用 `writeMemories()` 保存记忆 |
| `package.json`（根） | 新增 `script:test-memory-write` 命令 |
| `.env.local` / `.env.example` | 当时新增 `OPENROUTER_API_KEY`；当前主分支已改为 `packages/core` / `packages/web` 分别维护 env |

### 4. 记忆提取设计

一次 LLM 调用（`generateObject`）同时提取三类信息：

| 类别 | 说明 | 存储方式 |
|------|------|----------|
| `facts` | 确定性事实（名字、城市、偏好等） | `factual_memories` 表，UPSERT |
| `impressions` | 语义印象（模糊的感受和判断） | `semantic_memories` 表 + 向量 |
| `updates` | 用户纠正了旧信息 | 更新事实 + 生成语义记忆保留历史 |

提取原则：**宁精不滥**，一次对话最多 5 条事实 + 3 条印象。

### 5. chat 脚本增强

退出时（Ctrl+C）自动执行记忆保存：
```
💭 正在保存记忆...
✅ 记忆保存完成：
   事实记忆：3 新增，0 更新
   语义印象：2 条
```

---

## 验证结果

```
🧪 Batch 3 验证：记忆提取 + 写入

✅ 用户: zimu

📝 模拟对话：用户自我介绍 + 聊面试 + 聊女朋友

📊 提取结果：
   事实记忆：5 条新增
   语义印象：2 条

📋 事实记忆：
   ✅ { category: "basic_info", key: "name", value: "张三", importance: 0.9 }
   ✅ { category: "basic_info", key: "city", value: "深圳", importance: 0.7 }
   ✅ { category: "basic_info", key: "job", value: "前端开发", importance: 0.7 }
   ✅ { category: "event", key: "interview", value: "下周五在腾讯面试", importance: 0.8 }
   ✅ { category: "preference", key: "food_for_stress_relief", value: "火锅", importance: 0.5 }

📋 语义印象：
   ✅ "用户对下周五的腾讯面试感到有些紧张" (embedding: ✅ 1536维)
   ✅ "用户的女朋友小美在帮他准备面试，让他感到安心" (embedding: ✅ 1536维)

🎉 全部通过！
```

---

## 遇到的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| DeepSeek 无官方 Embedding API | DeepSeek 不提供独立 Embedding 端点 | 使用 OpenRouter 代理调用 OpenAI text-embedding-3-small |
| AI SDK 6.x `textEmbeddingModel` 弃用 | API 重命名 | 改用 `embeddingModel()` |
| Schema 维度不匹配 | 原 1024 维，text-embedding-3-small 默认 1536 维 | 修改 schema + 执行 migration |
| DeepSeek JSON schema 兼容性警告 | DeepSeek 不原生支持 response_format JSON schema | AI SDK 自动降级为注入 system message（不影响功能） |

---

## 可运行的命令

```bash
cd /Users/zimu/ai/snow

# 交互式聊天（退出时自动保存记忆）
pnpm run script:chat

# 自动化验证记忆写入
pnpm run script:test-memory-write
```

---

## 下一步

**Batch 4：记忆检索 + 注入 Prompt** — 实现记忆检索器（pgvector 搜索 + 鲜活度排序），让 Snow 跨会话记住之前聊过的事。
