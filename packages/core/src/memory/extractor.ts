import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getDeepSeekChat } from '../ai/models.js';

/**
 * 记忆提取结果 Schema
 * 来源：doc/tech/modules/memory-system.md § 四
 */
const memoryExtractionSchema = z.object({
  facts: z.array(z.object({
    category: z.enum(['basic_info', 'preference', 'relationship', 'event', 'opinion']),
    key: z.string().describe('记忆键，如 name、city、food'),
    value: z.string().describe('记忆值，如 张三、深圳、火锅'),
    importance: z.number().min(0).max(1).describe('重要性：0.9-1.0 核心身份，0.7-0.9 重要事件，0.4-0.7 偏好习惯，0.1-0.4 日常琐事'),
  })).describe('从新对话中提取的确定性事实'),

  impressions: z.array(z.object({
    content: z.string().describe('一段自然语言描述的印象，如"用户最近工作压力很大"'),
    importance: z.number().min(0).max(1),
    emotionalIntensity: z.number().min(0).max(1).describe('用户说这件事时的情感强度'),
    topic: z.string().describe('话题标签，如 工作、感情、健康'),
  })).describe('从新对话中提取的语义印象'),

  updates: z.array(z.object({
    category: z.string(),
    key: z.string(),
    oldValue: z.string().describe('之前记住的旧值'),
    newValue: z.string().describe('用户纠正后的新值'),
    reason: z.string().describe('更新原因'),
  })).describe('用户纠正了之前的信息，需要更新的记忆'),
});

export type MemoryExtraction = z.infer<typeof memoryExtractionSchema>;

/**
 * 从对话中提取记忆（增量提取）
 * 内部固定使用 DeepSeek Chat（结构化任务，不需要动态选模型）
 *
 * 一次 LLM 调用，同时提取事实记忆 + 语义印象 + 更新
 * 原则：宁精不滥，一次最多提取 5 条事实 + 3 条印象
 *
 * @param newMessages - 需要提取记忆的新对话（未提取过的部分）
 * @param contextSummary - 之前已提取过的对话摘要（仅供理解上下文，不从中提取）
 * @param existingFacts - 已知的用户事实（用于冲突检测）
 */
export async function extractMemories(
  newMessages: string,
  contextSummary?: string,
  existingFacts?: string,
): Promise<MemoryExtraction> {
  const contextSection = contextSummary
    ? `## 之前的对话背景（仅供理解上下文，不需要从中提取记忆）\n${contextSummary}\n\n`
    : '';

  const existingSection = existingFacts
    ? `\n\n已知的用户信息（如果用户纠正了这些信息，放入 updates）：\n${existingFacts}`
    : '';

  const { output } = await generateText({
    model: getDeepSeekChat(),
    output: Output.object({ schema: memoryExtractionSchema }),
    prompt: `你是 Snow 的记忆管理器。请**只从"需要提取记忆的新对话"部分**提取值得记住的信息。"之前的对话背景"仅供你理解上下文，不要从中提取。

提取原则：
- 只提取有长期价值的信息，不记录无意义的闲聊
- 如果用户纠正了之前的信息，放入 updates
- 如果对话中没有值得记住的信息，返回空数组即可
- importance 评分：
  · 0.9-1.0：核心身份信息（名字、生日）
  · 0.7-0.9：重要事件、重要关系
  · 0.4-0.7：偏好、习惯、观点
  · 0.1-0.4：日常琐事
- emotionalIntensity：用户说这件事时的情感强度
- 一次最多提取 5 条事实 + 3 条印象，宁精不滥${existingSection}

${contextSection}## 需要提取记忆的新对话
${newMessages}`,
  });

  if (!output) {
    return { facts: [], impressions: [], updates: [] };
  }

  return output;
}
