/**
 * 摘要相关工具
 * 内部固定使用 DeepSeek Chat
 *
 * 两种摘要场景共用核心函数：
 * - 滑动窗口：压缩早期对话 → 作为 LLM 的上下文
 * - 记忆提取：压缩已提取的对话 → 作为下次提取的背景
 */
import { generateText } from 'ai';
import { getDeepSeekChat } from '../ai/models.js';

/**
 * 通用对话摘要生成（核心函数）
 * 滑动窗口和记忆提取都复用此函数
 *
 * @param content - 需要总结的对话文本
 * @param existingSummary - 已有的旧摘要（如果有，会和新内容一起总结）
 * @param maxLength - 摘要最大字数，默认 200
 */
export async function generateConversationSummary(
  content: string,
  existingSummary?: string,
  maxLength: number = 200,
): Promise<string> {
  const toSummarize = existingSummary
    ? `[之前的总结]\n${existingSummary}\n\n[新的对话]\n${content}`
    : content;

  const { text: summary } = await generateText({
    model: getDeepSeekChat(),
    prompt: `请简要概括以下对话的要点。
要求：
- 保留所有关键信息（人名、地点、事件、关系、偏好）
- 保留情感基调和情绪变化
- 去掉重复和无关紧要的内容
- 控制在 ${maxLength} 字以内

${toSummarize}`,
  });

  return summary;
}

/**
 * 生成/更新记忆提取的上下文摘要
 *
 * 每次增量提取后调用，将旧摘要 + 新对话内容压缩为新摘要。
 * 始终调用 LLM 生成摘要（不拼接原文），确保摘要质量稳定。
 *
 * @param currentSummary - 当前累积的上下文摘要（可能为空）
 * @param newContent - 刚刚提取过的新对话内容
 * @returns 新的摘要
 */
export async function compressContextSummary(
  currentSummary: string,
  newContent: string,
): Promise<string> {
  return generateConversationSummary(newContent, currentSummary || undefined, 200);
}
