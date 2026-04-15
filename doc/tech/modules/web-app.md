# Web 应用（Web App）

> 所属：产品外壳 | 里程碑：M2 Batch 1  
> 依赖：Next.js + Vercel AI SDK + `@snow/core` + Supabase + Upstash  
> 版本：v0.4  
> 日期：2026-04-13  
> 状态：实现中

---

## 一、背景与目标

M1 已经完成了 Snow 的核心引擎：

- 对话
- 记忆
- 关系
- 情绪
- 摘要
- 外部显式自定义人格

M2 的目标不是重写 Snow，而是给她一个真正可用的 Web 外壳。

这个 Web 外壳需要：

1. 支持登录 / 注册
2. 支持和 Snow 流式聊天
3. 可部署到 Vercel
4. 能无缝复用 `@snow/core`
5. 不破坏 Snow 当前的核心架构边界

---

## 二、总体架构

### 2.1 架构原则

- `packages/core` 负责 Snow 的核心业务能力
- `packages/web` 负责 Web UI、身份接入和 HTTP 入口
- Web 不重新实现 Snow 的业务逻辑

### 2.2 运行关系

```text
Browser
  ↓
packages/web (Next.js on Vercel)
  ↓
@snow/core
  ↓
Supabase / Redis / LLM Providers
```

也就是说：

- Web 不是“访问一个外部 Snow 服务”
- 而是直接 import 并调用 `@snow/core`

---

## 三、项目结构

当前 `packages/web` 结构如下：

```text
packages/web/
├── actions/
│   └── auth.ts
├── app/
│   ├── globals.css                # Snow 设计系统 + 动画 + 暗色模式
│   ├── layout.tsx                 # next/font + Metadata + Viewport
│   ├── page.tsx
│   ├── chat/page.tsx
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── api/
│       ├── chat/route.ts
│       └── tasks/
│           └── idle/route.ts
├── components/
│   ├── ui/                        # 基础 UI 原子组件
│   │   ├── avatar.tsx             # Snow / 用户头像
│   │   └── typing-indicator.tsx   # 思考中脉冲动画
│   ├── auth/
│   │   └── auth-layout.tsx        # 认证页共用布局（毛玻璃 + 装饰背景）
│   └── chat/
│       ├── chat-header.tsx        # 顶栏（状态呼吸灯、设置入口）
│       ├── chat-input.tsx         # 输入框（毛玻璃底栏）
│       ├── chat-page-client.tsx   # 聊天页客户端核心组件
│       ├── message-bubble.tsx     # 消息气泡（头像 + 入场动画）
│       ├── message-list.tsx       # 消息列表（智能滚动 + typing indicator）
│       └── settings-drawer.tsx    # 自定义指令侧边抽屉
├── lib/
│   ├── utils.ts                   # cn() 工具
│   ├── auth/
│   │   ├── index.ts
│   │   ├── session.ts
│   │   └── user.ts
│   └── supabase/
│       ├── client.ts
│       ├── middleware.ts
│       ├── server.ts
│       └── shared.ts
├── public/
│   └── favicon.svg                # Snow 品牌图标
├── middleware.ts                   # Next.js middleware（Supabase 会话刷新）
├── package.json
├── next.config.ts
├── postcss.config.mjs
└── tsconfig.json
```

### 3.1 当前重构方向（2026-04）

本轮 Web 重构不只是“换皮”，而是同时处理：

1. 视觉方向重做
2. 聊天页信息架构重排
3. 客户端状态编排拆分
4. 组件职责重新收口

新的设计口径：

- 视觉风格收敛为 **夜间编辑部 / 私人礼宾台**
- 避免通用紫黑聊天模板感
- 桌面端采用 **侧栏 + 主会话舞台** 的双栏结构
- 移动端退化为单栏，但保留品牌信息、状态和设定入口
- 聊天页不再让 `chat-page-client.tsx` 同时承担所有状态与布局细节

新的组件组织原则：

- `chat-page-client.tsx` 只负责组装页面
- 聊天状态、`useChat` 适配、通知可见性等逻辑下沉到独立 hook
- 品牌侧栏、会话舞台、输入区、消息列表各自拆成独立组件
- 认证页共用表单字段样式与页面框架，减少重复 JSX

这次重构的目标不是追求组件数量，而是让：

- 视觉层
- 状态层
- 交互层

三者边界更清楚。

---

## 四、用户体系

### 4.1 目标

Web 用户必须能稳定映射到 Snow 的身份系统中。

Snow 识别用户所需的核心字段是：

- `platform`
- `platformId`
- `name`

### 4.2 Web 侧约定

- `platform = web`
- `platformId` = Supabase Auth UUID（稳定不变，不暴露给用户）
- `name` = 用户注册时填写并存进 Auth metadata 的昵称（人类可读，可修改）

### 4.3 字段设计

| 字段 | 值 | 约束 | 说明 |
|------|-----|------|------|
| `platformId` | Supabase Auth UUID | `UNIQUE(platformId, platform)` | 稳定身份标识，不可变 |
| `name` | 用户注册时填写 | 无数据库唯一约束 | 人类可读，主要来源于 Supabase Auth metadata，Snow 用这个叫用户 |

### 4.4 注册

注册表单收集：`name` + `email` + `password`

流程：

1. 前端校验 name 格式（2-20 字符）
2. 调用 `supabase.auth.signUp({ email, password, options: { data: { name } } })`
3. 对 Supabase 的“邮箱已存在但不直接报错”场景做显式判重处理
4. 注册成功后直接进入聊天页

职责边界：

- `packages/web` 只负责 Auth
- `packages/web` **不直接读写** core 数据库
- 首次进入 `/api/chat` 时，由 `@snow/core` 根据 `platform + platformId + name` 自动创建 `users` 与 `user_relations`

### 4.5 登录

登录表单：`email` + `password`

直接使用 `supabase.auth.signInWithPassword({ email, password })`。

登录成功后不做额外的 core 数据库写入。
用户真正开始聊天时，仍由 `@snow/core` 自己决定是否需要自动建档或同步昵称。

### 4.6 name 修改

用户可以修改 name，修改时：

1. 更新 Supabase Auth `user_metadata.name`
2. 下次聊天请求把新的 `name` 传给 `@snow/core`
3. `packages/web` 在请求 chat API 时把 trim 后的 `name` 传给 `@snow/core`
4. `@snow/core` 只在首次自动建档时消费这个名字，不负责表单输入归一化

---

## 五、聊天主链路

### 5.1 前端链路

```text
用户输入消息
   ↓
前端调用 /api/chat
   ↓
/api/chat 动态 import `getChatResponse()`
   ↓
Snow 返回流式响应
   ↓
前端实时展示
```

### 5.2 `/api/chat`

`/api/chat` 是 Web 端的聊天入口。

它的职责：

1. 获取当前登录用户
2. 组装 `platformId` / `platform`
3. 收集前端 `UIMessage`
4. 读取 `customDirective`
5. 动态导入并调用 `getChatResponse()`
6. 返回 AI SDK UIMessage 流响应

### 5.3 Web 对 core 的调用方式

Web Route Handler 运行时动态导入：

```ts
const { getChatResponse } = await import('@snow/core');

const result = await getChatResponse({
  platformId,
  platform: 'web',
  messages,
  customDirective,
});
```

当前实现直接返回：

```ts
return result.toUIMessageStreamResponse({
  originalMessages,
});
```

Web 前端当前直接使用 `@ai-sdk/react` 的 `useChat()`，并通过 `DefaultChatTransport` 对接 `/api/chat`。这样流式协议、消息增量和停止生成都直接复用 AI SDK 约定，不需要再自己维护 `ReadableStream` 解析逻辑。

### 5.4 聊天页前端架构口径

聊天页的前端组织应收敛为：

```text
chat/page.tsx
  ↓
ChatPageClient
  ├── useSnowChat()        ← useChat 适配、directive、notice、drawer 状态
  ├── ChatSidebar          ← 品牌、状态、用户摘要、自定义设定入口
  ├── ChatStage            ← Header + Notice/Error + MessageList + ChatInput
  └── SettingsDrawer       ← 个性化指令编辑
```

这样做的原因：

1. `useChat()`、自定义指令、通知可见性属于客户端编排逻辑，不应和视觉层耦合在一个大组件里
2. 侧栏与主舞台是两块不同的信息层，不应混在同一个 JSX 树里滚动维护
3. 认证页和聊天页要共享同一套视觉系统，但不共享一大堆页面级状态

---

## 六、用户自定义人格接入

### 6.1 设计原则

用户自定义人格已经在 M1 确认采用：

- 外部显式注入

因此 Web 的职责是：

1. 提供用户配置入口
2. 在聊天请求时生成 `customDirective`
3. 传给 `getChatResponse()`

当前 Batch 1 先实现了最小入口：

- 聊天页顶部提供一个可选的 `Custom Directive` 文本框
- 该值直接随 `/api/chat` 请求传入

### 6.2 core 不负责的事

`@snow/core` 不负责：

- 存储用户设置
- 管理设置面板
- 做聊天内自动人格学习

这些都属于 Web 或更上层产品逻辑。

---

## 七、部署方案

### 7.1 部署目标

M2 目标部署方式：

- `packages/web` → Vercel

### 7.2 Web 需要的环境变量

至少包括：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Snow core 运行所需环境变量
  - `DATABASE_URL`
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - 模型 provider key
  - `QSTASH_TOKEN`
  - `SNOW_IDLE_TASK_URL`
  - `QSTASH_CURRENT_SIGNING_KEY`
  - `QSTASH_NEXT_SIGNING_KEY`

当前本地运行口径已经证明：

- Web 和 core 共用同一套云端服务
- 部署时不需要重新设计变量结构

因此线上部署最简单的做法就是：

1. 把本地 `packages/web/.env.local` 中当前实际生效的变量原样搬到 Vercel
2. 只把 `SNOW_IDLE_TASK_URL` 从本地调试地址改成真实线上域名

当前线上实际必填变量清单：

- `DATABASE_URL`
- `DEEPSEEK_API_KEY`
- `OPENROUTER_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `SNOW_IDLE_TASK_URL`

当前可选但代码未直接使用：

- `QSTASH_URL`
- `DIRECT_URL`

### 7.3 为什么适合 Vercel

当前项目生态已经天然偏向 Vercel：

- Next.js
- Vercel AI SDK
- Route Handler
- 流式响应
- Serverless 调用模型

所以 Web 壳不需要额外寻找特殊部署方案。

### 7.4 Node 与运行时基线

当前 Web 与 monorepo 运行时基线已经统一到：

- Node.js `24.10.0`

本地开发建议直接使用仓库根目录的 `.nvmrc`：

```bash
nvm use
```

`packages/web` 当前直接使用 Next.js 16 默认的 **Turbopack** 开发与构建链路。

为了回到框架推荐路径，`@snow/core` 内部模块导入已经收敛到 bundler 友好的写法，不再依赖 webpack 专属的 `extensionAlias` 兼容层。

Next.js 运行时环境变量按 `packages/web/.env.local` 读取。本地联调时，Web 所需的 Supabase、QStash 和 core 运行变量都需要出现在该文件中，不能只放在仓库根目录 `.env.local`。

---

## 八、与调度系统的关系

Web 中会有一个：

- `/api/tasks/idle`

但它不是 Snow 的业务实现层。  
它只是 QStash 的 HTTP 回调入口。

真正的调度逻辑与 idle 收尾逻辑，仍然属于 `@snow/core`。

当前回调入口实现为：

- `packages/web/app/api/tasks/idle/route.ts`

其职责只有：

1. 校验 QStash 签名
2. 解析 payload
3. 动态导入 `handleDelayedTaskCallback()` 并执行

详见：

- [task-scheduler.md](task-scheduler.md)

---

## 九、验收标准

满足以下条件，可认为 M2 的 Web 应用基线完成：

1. `packages/web` 可本地运行  
2. 用户可以注册 / 登录  
3. 用户可以在页面中与 Snow 聊天  
4. `/api/chat` 可稳定流式返回  
5. Web 可部署到 Vercel  
6. Web 可调用 `@snow/core`，且不破坏 Snow 当前核心能力边界

### 9.1 部署后最小验收

如果本地已经跑通，那么线上至少再确认以下 4 件事：

1. 注册 / 登录正常
2. `/api/chat` 正常流式返回
3. 发送一条消息后，QStash 中能看到新的 idle 消息
4. 到达空闲窗口后，`/api/tasks/idle` 能成功回调并完成收尾

---

## 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-10 | v0.1 | 初稿：M2 Web 应用技术方案 |
| 2026-04-13 | v0.2 | 接入 useChat、Node 24、Turbopack 与当前实现口径同步 |
| 2026-04-13 | v0.3 | 用户体系重设计：name 唯一性、注册时创建 core 记录、platformId 使用 Auth UUID |
| 2026-04-15 | v0.4 | 新增 Web UI 重构口径：夜间编辑部视觉方向、聊天页双栏信息架构、客户端状态拆分原则 |
| 2026-04-15 | v0.5 | 注册链路补充邮箱显式判重与登录时 core 用户记录对齐策略 |
| 2026-04-15 | v0.6 | 明确 web/core 边界：web 不直接操作 core 数据库，core 在聊天链路里自动建档；name 的 trim 和归一化由 web 负责 |
| 2026-04-15 | v0.7 | 同步部署口径：`.env.example` 与真实运行变量一致，明确线上只需搬运现有 env 并替换 `SNOW_IDLE_TASK_URL` |
