# Snow 项目文档中心

> AI 情感陪伴助手 — 有温度的"人"，不是冰冷的工具

---

## 📁 目录结构

```
doc/
├── README.md                          ← 你在这里（文档导航）
│
├── product/                           ← 做什么（需求）
│   └── PRD.md                         ← 产品需求文档
│
├── design/                            ← 她是谁（人设、交互、视觉）
│   └── persona.md                     ← Snow 人设设定集
│
├── tech/                              ← 怎么做（技术）
│   ├── tech-stack.md                  ← 技术选型：选了什么、为什么选、详细讲解
│   ├── architecture.md                ← 架构设计：核心循环、模块依赖、ADR
│   └── modules/                       ← 模块实现设计（每个模块一个文件）
│       ├── README.md                  ← 模块索引
│       ├── prompt-composer.md         ← Prompt 编排引擎
│       ├── memory-system.md           ← 记忆系统
│       ├── relation-system.md         ← 关系系统
│       ├── emotion-engine.md          ← 情绪系统
│       ├── database-schema.md         ← 数据模型
│       ├── proactive-messaging.md     ← 主动消息系统（M2+）
│       ├── capability-system.md       ← 能力系统 MCP/Skill（M3+）
│       ├── message-gateway.md         ← 统一消息网关（M4+）
│       └── challenges.md             ← 技术挑战与对策
│
└── tasks/                             ← 任务清单（分批执行）
    ├── m1-tasks.md                    ← M1 分批任务清单（7 Batch）
    ├── m2-tasks.md                    ← M2 分批任务清单（Web / 调度 / 主动消息 / 图片）
    ├── batch1-report.md               ← Batch 1 完成报告
    ├── batch2-report.md               ← Batch 2 完成报告
    ├── batch3-report.md               ← Batch 3 完成报告
    ├── batch4-report.md               ← Batch 4 完成报告
    ├── batch5-report.md               ← Batch 5 完成报告
    ├── batch6-report.md               ← Batch 6 完成报告
    └── batch7-report.md               ← Batch 7 完成报告
```

项目代码结构详见 [m1-tasks.md](tasks/m1-tasks.md)。

---

## 📖 文档索引

### 产品 (product/)

| 文档 | 说明 | 状态 |
|------|------|------|
| [PRD.md](product/PRD.md) | 产品需求文档，功能模块、里程碑规划 | v0.1 讨论中 |

### 设计 (design/)

| 文档 | 说明 | 状态 |
|------|------|------|
| [persona.md](design/persona.md) | Snow 完整人设设定集：性格、语言风格、情绪表达 | v0.2 讨论中 |

### 技术 (tech/)

| 文档 | 说明 | 状态 |
|------|------|------|
| [tech-stack.md](tech/tech-stack.md) | 技术选型：每个技术的详细讲解、选型理由、代码示例 | v0.3 已确认 |
| [architecture.md](tech/architecture.md) | 架构设计：核心循环、模块依赖、设计决策（ADR） | v0.2 已确认 |
| [modules/](tech/modules/) | 模块实现设计（8 个独立文件） | v0.1 讨论中 |

### 任务 (tasks/)

| 文档 | 说明 | 状态 |
|------|------|------|
| [m1-tasks.md](tasks/m1-tasks.md) | M1 分批任务清单（7 Batch，命令行验证） | v0.2 已完成（Batch 1-7 ✅） |
| [m2-tasks.md](tasks/m2-tasks.md) | M2 分批任务清单（Web、延时队列、主动消息、图片） | v0.1 讨论中 |
| [batch7-report.md](tasks/batch7-report.md) | Batch 7 完成报告：外部显式自定义 + 完整循环 | v0.1 最新 |

---

## 📝 文档规范

- 所有文档使用 **Markdown** 格式
- 文件名小写，单词用连字符分隔（如 `memory-system.md`）
- 每个文档头部标注：版本号、日期、作者、状态
- 状态流转：`草稿` → `讨论中` → `已确认` → `已实现`

## 🗂️ 目录职责

| 目录 | 回答什么 | 举例 |
|------|---------|------|
| `product/` | **做什么**——需求、功能、用户故事 | PRD、功能清单 |
| `design/` | **她是谁**——人设、交互、视觉 | 人设文档、对话示例 |
| `tech/` | **怎么做**——技术选型、架构、实现 | 选型、架构、模块设计 |
| `tech/modules/` | **每个模块怎么做**——独立维护 | 记忆系统、情绪系统等 |
| `tasks/` | **什么时候做**——分批任务清单 | M1 任务、验证脚本 |

---

*随项目推进持续更新。*
