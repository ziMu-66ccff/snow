/**
 * 对话历史滑动窗口（基于 Redis）
 *
 * 设计原则：
 * - 保护消息（system + tool）不压缩：重要、数量少、tool_call/result 不能拆开
 * - 只对对话消息（user + assistant）计算 token 和裁剪
 * - 对话总结存 Redis，跨请求复用（Serverless 友好）
 *
 * 流程：
 * 1. 分离消息：保护消息 vs 对话消息
 * 2. 从 Redis 读 summary + summarized_up_to
 * 3. 异常检测：summarized_up_to > 对话消息数 → history 被重置 → 清空 Redis
 * 4. 已总结的消息用 summary 代替，未总结的保留原文
 * 5. 估算 token > 40K → 保留最近 10 轮 + 压缩早期为新 summary
 *
 * 内部固定使用 DeepSeek Chat 生成总结
 */
import { type ModelMessage } from 'ai';
import { isConversationMessage, isProtectedMessage, messageToText, formatMessages } from './message-utils';
import { generateConversationSummary } from '../memory/summarizer';
import {
  getChatSummary,
  getChatSummarizedUpTo,
  setChatSummary,
  clearChatSummary,
} from '../db/queries/redis-store';

/** 对话历史的 token 上限（只算 user/assistant 消息） */
const TOKEN_LIMIT = 40000;

/** 超限时保留最近多少轮原文（一轮 = user + assistant） */
const MAX_RECENT_ROUNDS = 10;

/** 总结消息的标识前缀 */
const SUMMARY_PREFIX = '[早期对话总结]';

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
    return sum + estimateTokens(messageToText(m)) + 4;
  }, 0);
}

/**
 * 对 messages 应用滑动窗口
 * @param platform - 平台标识
 * @param platformId - 平台用户 ID
 * @param messages - 完整对话历史（含当前消息）
 * @returns 处理后的 messages 数组（可直接传给 LLM）
 */
export async function applySlidingWindow(
  platform: string,
  platformId: string,
  messages: ModelMessage[],
): Promise<ModelMessage[]> {
  // 分离：保护消息（system + tool）vs 对话消息（user + assistant）
  const protectedMessages = messages.filter(isProtectedMessage);
  const conversationMessages = messages.filter(isConversationMessage);

  // 从 Redis 读总结状态
  // 如果都为空（首次对话 / Redis 过期）：existingSummary=null, summarizedUpTo=0
  // → unsummarizedMessages = 全部对话消息，不做任何压缩，全量传给 LLM
  const existingSummary = await getChatSummary(platform, platformId);
  let summarizedUpTo = await getChatSummarizedUpTo(platform, platformId);

  // 异常检测：history 被重置了（新会话）
  if (summarizedUpTo > conversationMessages.length) {
    await clearChatSummary(platform, platformId);
    summarizedUpTo = 0;
  }

  // 切分：已总结的（用 summary 代替）+ 未总结的（保留原文）
  const unsummarizedMessages = conversationMessages.slice(summarizedUpTo);

  // 估算 token：summary + 未总结消息
  const summaryTokens = existingSummary ? estimateTokens(existingSummary) : 0;
  const unsummarizedTokens = estimateMessagesTokens(unsummarizedMessages);
  const totalTokens = summaryTokens + unsummarizedTokens;

  // 不超限，直接用
  if (totalTokens <= TOKEN_LIMIT) {
    const result: ModelMessage[] = [...protectedMessages];
    if (existingSummary) {
      result.push({ role: 'system', content: `${SUMMARY_PREFIX} ${existingSummary}` });
    }
    result.push(...unsummarizedMessages);
    return result;
  }

  // 超限了，保留最近 N 轮，更早的压缩为新 summary
  const maxMessages = MAX_RECENT_ROUNDS * 2;
  const keepCount = Math.min(maxMessages, unsummarizedMessages.length);

  const earlyMessages = unsummarizedMessages.slice(0, unsummarizedMessages.length - keepCount);
  const recentMessages = unsummarizedMessages.slice(unsummarizedMessages.length - keepCount);

  // 如果没有早期消息可压缩（最近 10 轮本身就超限），直接返回
  if (earlyMessages.length === 0) {
    const result: ModelMessage[] = [...protectedMessages];
    if (existingSummary) {
      result.push({ role: 'system', content: `${SUMMARY_PREFIX} ${existingSummary}` });
    }
    result.push(...recentMessages);
    return result;
  }

  // LLM 生成新 summary：旧 summary + 早期消息 → 压缩（复用通用摘要函数）
  // 滑动窗口用 400 字（需要接上话），比记忆提取上下文的 200 字更长
  const earlyText = formatMessages(earlyMessages);
  const newSummary = await generateConversationSummary(earlyText, existingSummary ?? undefined, 400);

  // 更新 Redis：新的 summary + 新的 summarizedUpTo
  const newSummarizedUpTo = summarizedUpTo + earlyMessages.length;
  await setChatSummary(platform, platformId, newSummary, newSummarizedUpTo);

  // 组装结果
  const result: ModelMessage[] = [
    ...protectedMessages,
    { role: 'system', content: `${SUMMARY_PREFIX} ${newSummary}` },
    ...recentMessages,
  ];

  return result;
}
