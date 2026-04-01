/**
 * 摘要压缩工具
 * 内部固定使用 DeepSeek Chat
 */
import { generateText } from 'ai';
import { getDeepSeekChat } from '../ai/models.js';

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

  // 超长了，LLM 压缩为要点
  const { text: compressed } = await generateText({
    model: getDeepSeekChat(),
    prompt: `请将以下对话记录压缩为一段简洁的要点摘要。
要求：
- 保留所有关键信息（人名、地点、事件、关系、偏好）
- 保留情感基调
- 去掉重复和无关紧要的内容
- 控制在 200 字以内

对话记录：
${combined}`,
  });

  return compressed;
}
