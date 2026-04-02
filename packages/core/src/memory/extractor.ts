import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getDeepSeekChat } from '../ai/models.js';
import { buildMemoryExtractionPrompt } from '../prompts/memory-extraction.js';

/**
 * 记忆提取结果 Schema
 */
const memoryExtractionSchema = z.object({
  facts: z.array(z.object({
    category: z.enum(['basic_info', 'preference', 'relationship']),
    key: z.string().describe('英文小写+下划线，如 name, city, food, girlfriend'),
    value: z.string().describe('简洁属性值，2-10 个字，如 张三、深圳、火锅'),
    importance: z.number().min(0).max(1).describe('0.9-1.0 核心身份，0.7-0.8 重要关系，0.5-0.7 偏好习惯，0.3-0.5 次要信息'),
  })).describe('用户的稳定画像：身份、偏好、人际关系'),

  impressions: z.array(z.object({
    content: z.string().describe('15-40 字的自然语言印象，带情感色彩，第三人称"用户"'),
    importance: z.number().min(0).max(1),
    emotionalIntensity: z.number().min(0).max(1).describe('用户说这件事时的情感强度'),
    topic: z.string().describe('话题标签，2-4 个字，如 工作、感情、健康'),
  })).describe('Snow 对对话的模糊感受和印象'),

  updates: z.array(z.object({
    category: z.string(),
    key: z.string(),
    oldValue: z.string().describe('之前记住的旧值'),
    newValue: z.string().describe('用户纠正后的新值'),
    reason: z.string().describe('更新原因'),
  })).describe('用户明确纠正了之前的信息'),
});

export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;

/**
 * 从对话中提取记忆（增量提取）
 * 内部固定使用 DeepSeek Chat
 *
 * @param newMessages - 需要提取记忆的新对话（未提取过的部分）
 * @param contextSummary - 之前已提取过的对话摘要（仅供理解上下文）
 * @param existingFacts - 已知的用户事实（用于冲突检测）
 */
export async function extractMemories(
  newMessages: string,
  contextSummary?: string,
  existingFacts?: string,
): Promise<MemoryExtraction> {
  const { output } = await generateText({
    model: getDeepSeekChat(),
    output: Output.object({ schema: memoryExtractionSchema }),
    prompt: buildMemoryExtractionPrompt(newMessages, contextSummary, existingFacts),
  });

  if (!output) {
    return { facts: [], impressions: [], updates: [] };
  }

  return output;
}
