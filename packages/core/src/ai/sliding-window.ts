import { generateText, type ModelMessage } from 'ai';
import { getDeepSeekChat } from './models.js';

/**
 * 对话历史滑动窗口
 *
 * 来源：doc/tech/modules/memory-system.md § 六 "对话历史的滑动窗口"
 *
 * 设计原则：
 * - system message 不压缩（重要、数量少、token 少）
 * - 只对 user/assistant 对话消息计算 token 和裁剪
 *
 * 策略：
 * 1. 分离 system message 和对话消息
 * 2. 估算对话消息的 token 数
 * 3. 如果 <= TOKEN_LIMIT，原样返回
 * 4. 如果 > TOKEN_LIMIT：
 *    - system message：全部保留
 *    - 早期对话：LLM 压缩为新摘要（system message）
 *    - 最近 N 轮对话：保留原文
 *
 * 内部固定使用 DeepSeek Chat 生成摘要（结构化任务，不需要动态选模型）
 */

/** 对话历史的 token 上限（只算 user/assistant 消息） */
const TOKEN_LIMIT = 8000;

/** 超限时保留最近多少轮原文（一轮 = user + assistant） */
const MAX_RECENT_ROUNDS = 10;

/** 摘要消息的标识前缀 */
const SUMMARY_PREFIX = '[早期对话摘要]';

/**
 * 粗略估算 token 数
 */
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const nonChinese = text.replace(/[\u4e00-\u9fff]/g, '');
  const words = nonChinese.split(/\s+/).filter(Boolean).length;
  const otherChars = nonChinese.replace(/\s+/g, '').length;
  return chineseChars * 2 + words * 1.3 + otherChars * 0.5;
}

function estimateMessagesTokens(messages: ModelMessage[]): number {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + estimateTokens(content) + 4;
  }, 0);
}

/**
 * 对 history 应用滑动窗口
 */
export async function applySlidingWindow(
  history: ModelMessage[],
): Promise<ModelMessage[]> {
  // 分离：system 消息（全部保护）vs 对话消息（user/assistant）
  const systemMessages = history.filter(m => m.role === 'system');
  const conversationMessages = history.filter(m => m.role !== 'system');

  // 估算对话消息的 token 量
  const conversationTokens = estimateMessagesTokens(conversationMessages);

  // 不超限，原样返回
  if (conversationTokens <= TOKEN_LIMIT) {
    return history;
  }

  // 超限了，保留最近 N 轮原文，更早的压缩为摘要
  const maxMessages = MAX_RECENT_ROUNDS * 2;
  const keepCount = Math.min(maxMessages, conversationMessages.length);

  const earlyMessages = conversationMessages.slice(0, conversationMessages.length - keepCount);
  const recentMessages = conversationMessages.slice(conversationMessages.length - keepCount);

  // 如果没有早期消息可压缩（最近 10 轮本身就超 8K），直接返回
  if (earlyMessages.length === 0) {
    return [...systemMessages, ...recentMessages];
  }

  // LLM 生成早期对话摘要
  const earlyText = earlyMessages
    .map(m => `${m.role === 'user' ? '用户' : 'Snow'}: ${m.content}`)
    .join('\n');

  const { text: summary } = await generateText({
    model: getDeepSeekChat(),
    prompt: `请简要概括以下对话的要点，包括提到的关键信息、事件和情绪。用 2-3 句话概括即可。

对话内容：
${earlyText}`,
  });

  const newSummary: ModelMessage = {
    role: 'system',
    content: `${SUMMARY_PREFIX} ${summary}`,
  };

  // 组装：已有 system 消息 + 新摘要 + 最近对话
  return [...systemMessages, newSummary, ...recentMessages];
}
