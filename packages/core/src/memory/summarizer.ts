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
import { buildConversationSummaryPrompt } from '../prompts/conversation-summary.js';

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
  const { text: summary } = await generateText({
    model: getDeepSeekChat(),
    prompt: buildConversationSummaryPrompt(content, maxLength, existingSummary),
  });

  return summary;
}
