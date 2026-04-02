/**
 * 关系信号分析器
 *
 * 用 LLM 分析对话中的 4 维信号（timespan 由代码计算，不由 LLM 评估）。
 * 内部固定使用 DeepSeek Chat。
 *
 * 来源：doc/tech/modules/relation-system.md § 三
 */
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getDeepSeekChat } from '../ai/models.js';

/** LLM 分析的 4 维信号增量（-1 到 1） */
const relationSignalsSchema = z.object({
  interactionFreq: z.number().min(-1).max(1)
    .describe('互动质量：主动聊天、回复积极 → 正；敷衍、单字回复 → 负'),
  conversationDepth: z.number().min(-1).max(1)
    .describe('对话深度：分享个人故事、讨论感受 → 正；只发指令 → 负'),
  emotionalIntensity: z.number().min(-1).max(1)
    .describe('情感浓度：表达感谢/关心/信任 → 正；冷淡 → 负'),
  trustLevel: z.number().min(-1).max(1)
    .describe('信任信号：说秘密、求安慰 → 正；质疑/不信任 → 负'),
});

export type RelationSignals = z.infer<typeof relationSignalsSchema>;

/**
 * LLM 分析对话中的关系信号
 *
 * @param conversationMessages - 需要分析的对话文本
 * @param contextSummary - 之前的对话背景（帮助 LLM 理解上下文）
 * @returns 4 维信号增量
 */
export async function evaluateRelationSignals(
  conversationMessages: string,
  contextSummary?: string,
): Promise<RelationSignals> {
  const contextSection = contextSummary
    ? `## 之前的对话背景（仅供理解上下文）\n${contextSummary}\n\n`
    : '';

  const { output } = await generateText({
    model: getDeepSeekChat(),
    output: Output.object({ schema: relationSignalsSchema }),
    prompt: `你是 Snow 的关系分析器。请分析以下对话中的关系信号。

${contextSection}## 需要分析的对话
${conversationMessages}

请评估以下 4 个维度的变化（-1 到 1 之间的浮点数）：
- interactionFreq: 互动质量（主动聊天、话题丰富 → 正 0.1-0.5；敷衍、单字回复 → 负）
- conversationDepth: 对话深度（分享个人故事、讨论内心感受 → 正 0.2-0.6；只发指令、只让做事 → 负）
- emotionalIntensity: 情感浓度（表达感谢/关心/信任/喜欢 → 正 0.2-0.6；冷淡/敷衍 → 负）
- trustLevel: 信任信号（说秘密、问私人建议、寻求安慰 → 正 0.3-0.7；质疑/不信任 → 负）

评分指南：
- 普通闲聊给 0.1-0.2 的正向分数
- 有明显正向信号给 0.3-0.6
- 有明显负向信号给 -0.1 到 -0.5
- 没有明显信号的维度给 0
- 不要轻易给极端值（±0.8 以上）`,
  });

  if (!output) {
    return { interactionFreq: 0, conversationDepth: 0, emotionalIntensity: 0, trustLevel: 0 };
  }

  return output;
}
