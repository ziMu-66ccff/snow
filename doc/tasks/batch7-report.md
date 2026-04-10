# Batch 7 完成报告

> 日期：2026-04-10  
> 状态：✅ 已完成  
> 主题：外部显式自定义 + 完整循环

---

## 目标

完成 M1 最后一段闭环：

1. 外界可通过 `getChatResponse()` 显式注入用户自定义人格  
2. 完整跑通对话后的异步后处理  
3. 验证新会话仍可恢复记忆和情绪上下文

---

## 本批次设计收敛

Batch 7 最终没有采用“聊天中自动学习性格偏好”的方案，而是收敛为：

- 用户自定义人格完全外置
- core 不存储 `personality_customizations`
- core 不记录 `personality_adjustments`
- 外界只需在调用 `getChatResponse()` 时传入 `customDirective`

这样可以避免人格漂移，并让 core 保持纯粹。

---

## 实现内容

### 1. `getChatResponse()` 增加外部自定义入口

文件：
- `packages/core/src/ai/chat.ts`

新增参数：

```ts
customDirective?: string;
```

调用方式：

```ts
await getChatResponse({
  platformId: 'zimu',
  platform: 'system',
  customDirective: '和我说话可以更放松一点，少一点客套。',
  messages,
});
```

### 2. Prompt Composer 支持显式 Layer 3 注入

文件：
- `packages/core/src/ai/prompts-composer.ts`

现在 Layer 3 的来源不是数据库，而是 `getChatResponse()` 传入的 `customDirective`。

### 3. 删除人格自定义数据库表

文件：
- `packages/core/src/db/schema.ts`

已删除：
- `personality_customizations`
- `personality_adjustments`

正式迁移：
- `drizzle/0007_peaceful_skreet.sql`

迁移结果：
- `pnpm run db:migrate` 成功

### 4. 补充完整循环测试脚本

新增：
- `packages/core/scripts/test/test-full-loop.ts`

新增脚本命令：

```bash
pnpm run test:full-loop
```

---

## 验证内容

`test:full-loop` 实际验证了以下链路：

1. Prompt 可注入外部 `customDirective`
2. 两轮真实对话正常生成
3. `onFinish` 正常写入 Redis 热数据
4. `finalizeSession()` 正常触发 idle 收尾
5. `factual_memories` 正常写入
6. `semantic_memories` 正常写入
7. `user_relations` 正常更新
8. `conversations` 摘要正常持久化
9. `emotion_states` 正常落库
10. `emotion_trends` 正常生成
11. 新会话可继续检索记忆和恢复情绪上下文

实际测试结果：

- 事实记忆：`2` 条
- 语义记忆：`1` 条
- 对话摘要：`1` 条
- 情绪快照：`2` 条
- 情绪趋势：`1` 条
- 新会话记忆检索：✅
- 新会话情绪恢复：✅

---

## 结论

Batch 7 完成后，M1 的核心闭环已经成立：

- 对话
- 记忆写入
- 记忆检索
- 关系更新
- 情绪更新
- 摘要持久化
- 外部显式人格定制

M1 当前已经具备一个“可持续跨会话演化的 Snow”最小实现。
