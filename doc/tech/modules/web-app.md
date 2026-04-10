# Web 应用（Web App）

> 所属：产品外壳 | 里程碑：M2 Batch 1  
> 依赖：Next.js + Vercel AI SDK + `@snow/core` + Supabase + Upstash  
> 版本：v0.1  
> 日期：2026-04-10  
> 状态：讨论中

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

建议 `packages/web` 结构如下：

```text
packages/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── chat/page.tsx
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── api/
│       ├── chat/route.ts
│       └── tasks/
│           └── idle/route.ts
├── components/
│   ├── chat/
│   ├── auth/
│   └── ui/
├── lib/
│   ├── auth.ts
│   ├── env.ts
│   └── types.ts
├── package.json
└── tsconfig.json
```

---

## 四、用户体系

### 4.1 目标

Web 用户必须能稳定映射到 Snow 的身份系统中。

Snow 识别用户所需的核心字段是：

- `platform`
- `platformId`

### 4.2 Web 侧约定

M2 中建议固定：

- `platform = web`

### 4.3 `platformId` 设计

Web 登录后，应为每个用户提供一个稳定的唯一标识作为 `platformId`。

建议：

- 直接使用 Web 用户系统中的唯一用户 ID

这样：

- 同一用户多次登录仍是同一个 Snow 身份
- 记忆、关系、情绪都能延续

### 4.4 登录 / 注册

M2 Batch 1 只需要最小可用登录体系：

1. 注册
2. 登录
3. 获取当前用户身份
4. 让聊天请求能携带稳定用户 ID

具体认证技术可继续使用 Supabase 体系，但 Web 应用层只需要关注：

- 能拿到稳定 user id
- 能把 user id 传给 Snow

---

## 五、聊天主链路

### 5.1 前端链路

```text
用户输入消息
   ↓
前端调用 /api/chat
   ↓
/api/chat 调 getChatResponse()
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
3. 收集前端消息
4. 读取用户配置生成 `customDirective`
5. 调用 `getChatResponse()`
6. 返回流式结果

### 5.3 Web 对 core 的调用方式

Web Route Handler 中直接：

```ts
import { getChatResponse } from '@snow/core';
```

然后调用：

```ts
await getChatResponse({
  platformId,
  platform: 'web',
  messages,
  customDirective,
});
```

---

## 六、用户自定义人格接入

### 6.1 设计原则

用户自定义人格已经在 M1 确认采用：

- 外部显式注入

因此 Web 的职责是：

1. 提供用户配置入口
2. 保存用户配置
3. 在聊天请求时生成 `customDirective`
4. 传给 `getChatResponse()`

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

- 数据库连接
- Redis
- LLM provider key
- QStash 签名 / token
- 认证相关配置

### 7.3 为什么适合 Vercel

当前项目生态已经天然偏向 Vercel：

- Next.js
- Vercel AI SDK
- Route Handler
- 流式响应
- Serverless 调用模型

所以 Web 壳不需要额外寻找特殊部署方案。

---

## 八、与调度系统的关系

Web 中会有一个：

- `/api/tasks/idle`

但它不是 Snow 的业务实现层。  
它只是 QStash 的 HTTP 回调入口。

真正的调度逻辑与 idle 收尾逻辑，仍然属于 `@snow/core`。

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

---

## 更新日志

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-04-10 | v0.1 | 初稿：M2 Web 应用技术方案 |
