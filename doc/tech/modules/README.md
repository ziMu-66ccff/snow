# Snow — 实现设计文档索引

> 版本：v0.1  
> 日期：2026-03-30  
> 前置文档：[tech-stack.md](../tech-stack.md)（技术选型）、[architecture.md](../architecture.md)（架构设计）

本目录聚焦于**每个核心模块的具体实现**：接口定义、数据流、代码设计。

---

## 模块文档

| 文档 | 模块 | M1 | 说明 |
|------|------|-----|------|
| [prompt-composer.md](prompt-composer.md) | Prompt 编排引擎 | ✅ | 系统中枢，动态组装 System Prompt |
| [memory-system.md](memory-system.md) | 记忆系统 | ✅ | 三层记忆架构、读写流程、关系模型、记忆衰减 |
| [relation-system.md](relation-system.md) | 关系系统 | ✅ | 五维信号评估、亲密度计算、降级保护 |
| [emotion-engine.md](emotion-engine.md) | 情绪系统 | ✅ | 情绪状态机、计算流程、EMA 平滑 |
| [database-schema.md](database-schema.md) | 数据模型 | ✅ | 8 张核心表详细字段说明、Redis 缓存、ER 关系 |
| [proactive-messaging.md](proactive-messaging.md) | 主动消息系统 | ❌ M2+ | 调度架构、触发机制、频率控制 |
| [capability-system.md](capability-system.md) | 能力系统 (MCP/Skill) | ❌ M3+ | 能力注册、路由、自发现 |
| [message-gateway.md](message-gateway.md) | 统一消息网关 | ❌ M4+ | 多平台适配器、消息流转 |
| [challenges.md](challenges.md) | 技术挑战与对策 | — | 已知难点和应对方案 |

---

## 阅读顺序建议

1. 先看 [architecture.md](../architecture.md) 了解核心循环
2. 再看 [prompt-composer.md](prompt-composer.md)——它是循环的中枢
3. 然后看 [memory-system.md](memory-system.md)——它是一切的基础设施
4. 其他模块按需阅读

---

*每个模块独立维护，互不耦合。改一个不用翻几千行。*
