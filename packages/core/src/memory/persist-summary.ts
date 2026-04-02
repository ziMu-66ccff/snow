/**
 * 持久化 Redis 上下文摘要到 PG conversations 表
 *
 * 将 Redis 中的热数据（context_summary）写入 PG 冷存储，
 * 作为下次新会话时的"上次对话摘要"兜底。
 */
import { getMemoryContextSummary } from '../db/queries/redis-store.js';
import { insertConversation } from '../db/queries/memory-read.js';

/**
 * 持久化摘要
 * 如果 Redis 中没有摘要，不做任何事。
 */
export async function persistContextSummary(
  userId: string,
  platform: string,
  platformId: string,
): Promise<void> {
  const summary = await getMemoryContextSummary(platform, platformId);
  if (!summary) return;

  await insertConversation({
    userId,
    platform,
    summary,
  });
}
