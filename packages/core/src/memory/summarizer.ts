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

/** 上下文摘要的字符长度阈值，超过则用 LLM 压缩 */
const CONTEXT_SUMMARY_MAX_LENGTH = 1500;

/**
 * 压缩上下文摘要
 *
 * 用于增量记忆提取时维护"之前已提取部分的摘要"。
 * 当摘要累积过长时，用 LLM 压缩为要点，控制 token 开销。
 *
 * @param currentSummary - 当前累积的上下文摘要
 * @param newContent - 刚刚提取过的新对话内容
 * @returns 压缩后的摘要
 */
export async function compressContextSummary(
  currentSummary: string,
  newContent: string,
): Promise<string> {
  const combined = currentSummary
    ? `${currentSummary}\n${newContent}`
    : newContent;

  // 不超长，直接拼接
  if (combined.length <= CONTEXT_SUMMARY_MAX_LENGTH) {
    return combined;
  }

  // 超长了，用通用摘要函数压缩
  return generateConversationSummary(newContent, currentSummary, 400);
}
