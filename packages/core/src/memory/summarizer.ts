/**
 * 通用对话摘要生成
 * 内部固定使用 DeepSeek Chat
 *
 * 两种场景共用：
 * - 滑动窗口：压缩早期对话 → 作为 LLM 的上下文（maxLength=400）
 * - 记忆提取：压缩已提取的对话 → 作为下次提取的背景（maxLength=200）
 */
import { generateText } from 'ai';
import { getDeepSeekChat } from '../ai/models.js';

/**
 * 生成对话摘要
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
    prompt: existingSummary
      ? `请将以下旧总结和新对话合并为一段新的总结。
要求：
- 保留旧总结中的关键信息（不能丢弃）
- 融入新对话中的新信息
- 保留所有关键信息（人名、地点、事件、关系、偏好）
- 保留情感基调和情绪变化
- 去掉重复和无关紧要的内容
- 控制在 ${maxLength} 字以内

${toSummarize}`
      : `请简要概括以下对话的要点。
要求：
- 保留所有关键信息（人名、地点、事件、关系、偏好）
- 保留情感基调和情绪变化
- 去掉重复和无关紧要的内容
- 控制在 ${maxLength} 字以内

${content}`,
  });

  return summary;
}
