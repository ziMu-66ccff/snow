# 情绪系统（Emotion Engine）

> 所属：核心模块 | 里程碑：M1  
> 依赖：Upstash Redis（状态存储）、LLM（情感分析）

---

## 情绪状态机

```typescript
interface EmotionState {
  primary: EmotionType;     // 主情绪
  secondary?: EmotionType;  // 次情绪
  intensity: number;        // 强度 0-1
  lastUpdated: Date;
}

type EmotionType = 
  | 'happy'      // 开心
  | 'caring'     // 关心
  | 'sad'        // 难过
  | 'playful'    // 俏皮
  | 'worried'    // 担心
  | 'missing'    // 想念
  | 'neutral';   // 平静
```

---

## 情绪转换规则

```typescript
const EMOTION_TRANSITIONS: Record<string, EmotionType> = {
  'user_shares_good_news': 'happy',
  'user_expresses_sadness': 'caring',
  'user_absent_long_time': 'missing',
  'light_conversation': 'playful',
  'user_mentions_health_issue': 'worried',
};
```

---

## 情绪计算流程

```
用户消息 → 情感分析（LLM）
                ↓
       识别用户情绪倾向
                ↓
  结合 Snow 当前情绪状态 + 转换规则
                ↓
       计算新的情绪状态
                ↓
  写入 Upstash Redis（供 Prompt Composer 读取）
```

---

## 情绪持久性（EMA 平滑）

- 情绪不是瞬时的，有**惯性**——不会因为一条消息就突然大变
- 用 **指数移动平均（EMA）** 平滑情绪变化
- 严重事件可以突破平滑（如用户说了很悲伤的事）

---

## 待设计

- [ ] EMA 的具体参数（alpha 值）
- [ ] 情绪分析是否可以在 Prompt 中内联完成（减少一次 LLM 调用）
- [ ] 情绪可视化方案（前端展示 Snow 的心情？）
