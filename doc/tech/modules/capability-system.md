# 能力系统（MCP / Skill）

> 所属：扩展模块 | 里程碑：M3+  
> 依赖：Vercel AI SDK (Tool Calling)

---

## 能力注册与路由

```typescript
interface Capability {
  id: string;
  name: string;
  description: string;
  type: 'mcp' | 'skill';
  endpoint?: string;
  trustLevel: 'builtin' | 'verified' | 'community';
  status: 'installed' | 'available';
}

async function routeCapability(intent: string): Promise<Capability | null> {
  const installed = await matchInstalled(intent);
  if (installed) return installed;
  
  const available = await searchCapabilityMarket(intent);
  if (available && available.trustLevel !== 'untrusted') {
    await installCapability(available);
    return available;
  }
  
  return null;
}
```

---

## 能力自发现流程

```
用户意图 → "帮我查航班"
     ↓
意图识别 → intent: "flight_search"
     ↓
本地能力匹配 → 未找到
     ↓
能力市场搜索 → 找到 "flight-search-mcp"
     ↓
安全审核 → trustLevel: "verified" ✓
     ↓
自动安装 → 注册到本地能力表
     ↓
调用执行 → 返回航班信息
     ↓
Snow 用自己的风格包装结果 → 返回给用户
```

---

## 待设计

- [ ] 能力市场的具体实现
- [ ] 信任等级评估机制
- [ ] 沙箱执行环境
