# 主动消息系统（Proactive Messaging）

> 所属：核心模块 | 里程碑：M2+  
> 依赖：Vercel Cron Jobs + Upstash QStash + Supabase Realtime

---

## 架构

```
┌──────────────────────────────────────────┐
│              调度器 (Scheduler)            │
│                                           │
│  ┌─────────────┐    ┌─────────────────┐  │
│  │ 定时触发器   │    │ 事件触发器       │  │
│  │ Vercel Cron │    │ QStash Event    │  │
│  │             │    │                 │  │
│  │ · 早安 8:00 │    │ · 天气变化      │  │
│  │ · 晚安 23:00│    │ · 用户生日      │  │
│  │ · 定期关怀  │    │ · 长时间未交互  │  │
│  └──────┬──────┘    └───────┬─────────┘  │
│         └────────┬──────────┘            │
│                  ▼                        │
│        ┌──────────────────┐              │
│        │  消息生成器       │              │
│        │ (调用 LLM 生成   │              │
│        │  个性化消息)      │              │
│        └────────┬─────────┘              │
│                 ▼                         │
│        ┌──────────────────┐              │
│        │ 频率控制 & 去重   │              │
│        └────────┬─────────┘              │
│                 ▼                         │
│        ┌──────────────────┐              │
│        │ Supabase Realtime│              │
│        │    → 推送到前端   │              │
│        └──────────────────┘              │
└──────────────────────────────────────────┘
```

---

## 技术实现（Serverless 版本）

```typescript
// Vercel Cron → 触发 QStash → 调用 API
// vercel.json
{
  "crons": [
    { "path": "/api/proactive/morning", "schedule": "0 8 * * *" },
    { "path": "/api/proactive/evening", "schedule": "0 22 * * *" }
  ]
}

// /api/proactive/morning/route.ts
export async function GET() {
  const activeUsers = await getActiveUsers();
  
  for (const user of activeUsers) {
    await qstash.publishJSON({
      url: `${BASE_URL}/api/proactive/generate`,
      body: { userId: user.id, type: 'morning_greeting' },
    });
  }
  
  return Response.json({ sent: activeUsers.length });
}
```

---

## 待设计

- [ ] 频率控制具体策略
- [ ] 用户时区处理
- [ ] 主动消息质量评估
