/**
 * 增量记忆提取（独立功能函数）
 *
 * 从对话文本中提取记忆并写入 PG，更新 Redis 上下文摘要。
 * 由编排层（task-scheduler）调用，不关心触发时机。
 */
import { writeMemories } from './writer';
import { generateConversationSummary } from './summarizer';
import { setMemoryContextSummary } from '../db/queries/redis-store';

/**
 * 执行一次增量记忆提取
 *
 * @param userId - 用户 UUID（写 PG 用）
 * @param platform - 平台（读写 Redis 用）
 * @param platformId - 平台用户 ID（读写 Redis 用）
 * @param messagesText - 需要提取的对话文本
 * @param contextSummary - 之前的上下文摘要（可选）
 */
export async function runMemoryExtraction(
  userId: string,
  platform: string,
  platformId: string,
  messagesText: string,
  contextSummary?: string,
): Promise<void> {
  // LLM 提取记忆 → 写 PG
  await writeMemories({
    userId,
    newMessages: messagesText,
    contextSummary,
  });

  // 生成新的 context_summary → 更新 Redis
  const newSummary = await generateConversationSummary(
    messagesText,
    contextSummary,
  );
  await setMemoryContextSummary(platform, platformId, newSummary);
}
