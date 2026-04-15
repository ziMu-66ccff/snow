/**
 * 关系信号分析器
 *
 * 用 LLM 分析对话中的 4 维信号（timespan 由代码计算，不由 LLM 评估）。
 * 内部固定使用 DeepSeek Chat。
 */
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getDeepSeekChat } from '../ai/models';
import { buildRelationEvaluationPrompt } from '../prompts/relation-evaluation';

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
 */
export async function evaluateRelationSignals(
  conversationMessages: string,
  contextSummary?: string,
): Promise<RelationSignals> {
  const { output } = await generateText({
    model: getDeepSeekChat(),
    output: Output.object({ schema: relationSignalsSchema }),
    prompt: buildRelationEvaluationPrompt(conversationMessages, contextSummary),
  });

  if (!output) {
    return { interactionFreq: 0, conversationDepth: 0, emotionalIntensity: 0, trustLevel: 0 };
  }

  return output;
}
