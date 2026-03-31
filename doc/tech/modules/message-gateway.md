# 统一消息网关（Message Gateway）

> 所属：接入层 | 里程碑：M4+  
> 依赖：各平台 Bot API

---

## 适配器模式

```typescript
// 统一消息格式
interface UnifiedMessage {
  messageId: string;
  userId: string;
  platform: 'web' | 'qq' | 'wechat' | 'telegram';
  content: MessageContent;
  timestamp: Date;
  direction: 'incoming' | 'outgoing';
}

// 平台适配器接口
interface PlatformAdapter {
  platform: string;
  receiveMessage(rawMessage: any): UnifiedMessage;
  sendMessage(message: UnifiedMessage): Promise<void>;
  getCapabilities(): PlatformCapability[];
}

// 各平台适配器
class WebAdapter implements PlatformAdapter { ... }
class QQAdapter implements PlatformAdapter { ... }
class WeChatAdapter implements PlatformAdapter { ... }
class TelegramAdapter implements PlatformAdapter { ... }
```

---

## 消息流转

```
[平台] → [Adapter.receiveMessage()] → [UnifiedMessage]
                                            ↓
                                    [Core Engine 处理]
                                            ↓
                                    [UnifiedMessage 响应]
                                            ↓
[平台] ← [Adapter.sendMessage()] ← [UnifiedMessage]
```

---

## 待设计

- [ ] 各平台 Bot 注册和接入细节
- [ ] 消息格式差异处理（图片、卡片等）
- [ ] 跨平台消息同步
