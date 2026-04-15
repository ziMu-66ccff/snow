# 任务调度系统（Task Scheduler）

> 所属：核心基础设施 | 里程碑：M2 Batch 1  
> 依赖：Upstash QStash + Upstash Redis + Next.js Route Handler  
> 版本：v0.3  
> 日期：2026-04-13  
> 状态：实现中

---

## 一、背景与目标

M1 阶段，Snow 的延时任务由 `setTimeout` 驱动：

- 每次对话结束后推一个 30 分钟延时任务
- 若 30 分钟内没有新消息，则执行 idle 收尾逻辑

这个方案在 CLI 常驻进程里成立，但不适合 Web / Vercel：

- Serverless 函数不会常驻 30 分钟
- 进程内 `Map` 无法跨实例共享
- 任务覆盖与幂等无法依赖单进程状态

M2 的目标是：

1. 用真正可部署的延时队列替换 `setTimeout`
2. 保持 M1 已确定的产品语义不变
3. 让 Snow 在 Web / Vercel 环境下依然能正常执行会话结束收尾逻辑

---

## 二、设计原则

### 2.1 调度逻辑在 Snow core

以下逻辑必须继续属于 `@snow/core`：

- 何时推送延时任务
- 何时取消旧任务
- 会话结束的业务语义
- 覆盖逻辑
- 幂等约束
- idle 收尾真正执行的业务逻辑

也就是说：

- `scheduleDelayedTask()`
- `cancelDelayedTask()`
- `executeIdleTasks()`

都应继续属于 `packages/core`。

当前实现另外增加了：

- `handleDelayedTaskCallback()`

这个函数同样属于 core，用来判断：

- 当前回调是不是最新任务
- 当前回调是不是已经执行过

### 2.2 Web 只提供回调入口

`packages/web` 只负责提供一个可被 QStash 调用的 HTTP Route Handler，例如：

- `/api/tasks/idle`

该入口只负责：

1. 验签
2. 解析任务 payload
3. 调用 `@snow/core` 的 `handleDelayedTaskCallback()`

它不是 Snow 的业务实现层。

### 2.3 单用户单待执行任务

任何时刻，同一用户只能有一个待执行中的“会话结束任务”。

### 2.4 新消息覆盖旧任务

只要 30 分钟内收到新消息，就说明当前会话仍在继续。此时：

- 旧任务失效
- 推送新的 30 分钟任务

### 2.5 回调必须幂等

即使发生以下情况，也不能造成不可接受的重复副作用：

- 队列重试
- 网络抖动
- 回调重复触发
- 取消与执行发生竞态

---

## 三、选型

### 3.1 选型结论

M2 使用：

- **Upstash QStash**

作为延时任务系统。

### 3.2 选择原因

1. 当前项目已经在使用 Upstash Redis  
2. QStash 天然适合：
   - 延迟 HTTP 回调
   - Serverless 环境
   - 重试
3. 可直接和 Vercel / Next.js 配合
4. 对当前需求已经足够：
   - 30 分钟后回调
   - 可覆盖旧任务
   - 可做幂等保护

### 3.4 本地开发回退策略

为了不打断当前 CLI 测试和本地联调，core 仍保留一个开发期回退：

- 如果未配置 `CORE_QSTASH_TOKEN` 或 `CORE_QSTASH_IDLE_CALLBACK_URL`
- `scheduleDelayedTask()` 会退回进程内 `setTimeout`

这只是本地开发兜底，不是生产方案。生产与 Vercel 部署时仍以 QStash 为准。

### 3.3 不继续使用 `setTimeout` 的原因

`setTimeout` 只适用于：

- 单进程
- 常驻内存
- CLI 或自托管 worker

不适用于：

- Vercel
- 多实例
- 无服务器路由

---

## 四、核心语义

### 4.1 会话结束定义

Snow 当前的产品语义保持不变：

- **30 分钟无消息 = 会话结束**

一旦会话结束，需要执行 idle 收尾逻辑：

1. 记忆提取
2. 关系更新
3. 对话摘要持久化
4. 情绪快照持久化
5. 情绪趋势摘要刷新
6. 记忆 GC

### 4.2 会话继续定义

- **30 分钟内有新消息 = 当前会话仍在继续**

此时必须取消之前尚未执行的任务，并推送新的 30 分钟任务。

---

## 五、核心链路

### 5.1 新消息到达后的链路

```text
用户发送消息
   ↓
getChatResponse()
   ↓
streamText.onFinish
   ↓
scheduleDelayedTask(user)
   ↓
1. 取消旧任务（如果存在）
2. 创建新的 30 分钟延时任务
3. 把新任务 ID 写入 Redis
```

### 5.2 30 分钟后无消息的链路

```text
QStash 到点回调 /api/tasks/idle
   ↓
Web Route Handler 验签
   ↓
调用 handleDelayedTaskCallback(payload)
   ↓
Snow core 校验任务是否过期、是否重复
   ↓
Snow core 执行完整收尾逻辑
```

当前 Web 端入口为：

- `/api/tasks/idle`

该入口只做两件事：

1. 验证 QStash 签名
2. 调用 `@snow/core` 的 `handleDelayedTaskCallback()`

当 Web 通过 tunnel 或反向代理暴露在公网时，验签应使用 QStash 实际调用的公网地址，也就是 `WEB_QSTASH_IDLE_CALLBACK_URL`。core 侧发布任务时使用 `CORE_QSTASH_IDLE_CALLBACK_URL`。这两个 key 虽然值应相同，但分别归属于 core 与 web，不能共享同一个 env 名。

---

## 六、覆盖逻辑

### 6.1 目标

覆盖逻辑要保证：

- 同一用户始终只有一个待执行中的会话结束任务
- 新消息到来时，旧任务不应再代表当前会话

### 6.2 具体规则

每次收到新消息时：

1. 读取 Redis 中当前记录的待执行任务 ID
2. 如果存在旧任务且尚未执行：
   - 调用 QStash 取消旧任务
3. 创建一个新的 30 分钟延时任务
4. 将新的任务 ID 写回 Redis

### 6.4 关于 QStash 控制台中的 `CANCEL_REQUESTED`

在 Upstash QStash 的日志里，取消消息后通常会先看到：

- `CANCEL_REQUESTED`

这表示：

- QStash 已经记录了取消请求
- 但该消息还没有进入最终的 `CANCELLED` 终态

对 Snow 这种“30 分钟后触发”的延时任务来说，这很常见：

- 用户继续说话
- Snow 取消旧任务并推一个新任务
- 控制台里会留下很多 `CANCEL_REQUESTED`

这**不等于旧任务还会继续执行**。

真正的安全性来自两层：

1. 我们会优先调用 QStash 的 cancel API
2. 即使旧任务没有被平台立即清干净，`handleDelayedTaskCallback()` 仍会用 Redis 中的最新 `taskId` 判定旧回调为 `stale`

所以：

- 控制台里看到一串 `CANCEL_REQUESTED`，更多是 QStash 的日志表现
- 是否会误执行，取决于 Snow core 的 `stale / duplicate` 保护

### 6.3 需要的 Redis 状态

当前实现新增了一个专用 key：

```text
snow:scheduler:idle:{platform}:{platformId}
```

当前存储：

```json
{
  "taskId": "web:user-123:uuid",
  "messageId": "qstash-message-id",
  "scheduledFor": "2026-04-10T12:30:00.000Z"
}
```

用途：

- 覆盖旧任务
- 排查任务状态
- 为幂等提供辅助上下文

---

## 七、幂等与重试

### 7.1 为什么必须做幂等

即使做了“取消旧任务”，仍然可能出现：

- 旧任务已经进入执行边缘
- 回调被重试
- 同一任务被重复投递

如果不做幂等，可能出现：

- 重复写摘要
- 重复跑关系更新
- 重复写情绪快照

### 7.2 幂等目标

不是要求“数据库一行都不能重复”，而是要求：

- 同一轮会话结束任务被重复触发时，系统不会产生不可接受的副作用
- 最终状态保持一致或可接受

### 7.3 建议方案

当前实现会为每个执行任务打一个幂等锁：

```text
snow:scheduler:idle:executed:{taskId}
```

执行前：

1. `SETNX` 尝试写入执行标记
2. 成功才继续执行 `executeIdleTasks()`
3. 失败则直接返回，视为该任务已处理

这能解决：

- 回调重复触发
- QStash 重试
- 边缘竞态

---

## 八、Web 回调入口

### 8.1 回调位置

建议在 `packages/web` 中提供：

```text
app/api/tasks/idle/route.ts
```

### 8.2 回调职责

这个 Route Handler 只做两件事：

1. 验证 QStash 请求合法性
2. 调用 `@snow/core` 的 `handleDelayedTaskCallback()`

### 8.3 不应在 Web 中做的事

以下逻辑不应放在 Web 壳里：

- 判断是否需要调度
- 生成覆盖逻辑
- 维护会话结束语义
- 编排 Snow 的收尾任务

这些都属于 `@snow/core`。

### 8.4 当前代码边界

- Web 回调入口：`packages/web/app/api/tasks/idle/route.ts`
- core 调度实现：`packages/core/src/scheduler/delayed-task.ts`
- core 编排实现：`packages/core/src/scheduler/task-scheduler.ts`
- Redis 状态实现：`packages/core/src/db/queries/redis-store.ts`

### 8.5 本地开发 fallback

为了不打断现有 CLI 和本地测试，当前实现保留了一个开发态 fallback：

- 若未配置 `CORE_QSTASH_TOKEN` 或 `CORE_QSTASH_IDLE_CALLBACK_URL`
- `scheduleDelayedTask()` 会退回到进程内 `setTimeout`

这个 fallback 只用于本地开发。  
生产与 Vercel 部署环境必须使用 QStash。

---

## 九、对现有 core 的改造点

### 9.1 `delayed-task.ts`

当前：

- `setTimeout`
- 进程内 `Map`

M2 后：

- QStash publish / cancel
- Redis 记录当前任务 ID
- 保留本地 fallback

### 9.2 `chat.ts`

当前：

- `onFinish` 后调用 `scheduleDelayedTask()`

M2 后：

- 对外接口保持不变
- 但 `scheduleDelayedTask()` 内部改为真正的延时队列实现

### 9.3 `task-scheduler.ts`

`executeIdleTasks()` 继续保留在 core 中，不迁移到 web。

### 9.4 `redis-store.ts`

新增：

- 待执行 idle 任务状态读写
- idle 执行幂等锁

---

## 十、验收标准

满足以下条件，可认为 M2 的调度系统改造完成：

1. 新消息可覆盖旧延时任务  
2. 同一用户同一时刻只有一个待执行会话结束任务  
3. 30 分钟无消息后，idle 收尾逻辑可正常执行  
4. `executeIdleTasks()` 在 Web / Vercel 环境下可运行  
5. 回调重复触发时不会造成不可接受的重复副作用  
6. 失败任务可重试  
7. Snow 的业务逻辑边界仍保持在 core 中

---

## 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-10 | v0.1 | 初稿：M2 调度系统设计，替换 setTimeout 为 QStash |
| 2026-04-10 | v0.2 | 落地实现：增加 QStash 覆盖逻辑、幂等锁、`handleDelayedTaskCallback()` 与本地 fallback |
| 2026-04-15 | v0.3 | 补充 QStash `CANCEL_REQUESTED` 状态说明，明确真正安全性来自 cancel + stale/duplicate 双重保护 |
