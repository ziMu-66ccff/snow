/**
 * 增量记忆提取任务
 *
 * 两种触发方式共用这一个流程：
 * 1. 轮次触发：unextracted >= 10 条（5 轮）
 * 2. 延时触发：30 分钟无新消息
 *
 * 流程：
 * 1. 原子取出 unextracted 消息
 * 2. 读 context_summary 作为背景上下文
 * 3. LLM 提取 facts + impressions + updates → 写 PG
 * 4. 生成新的 context_summary → 更新 Redis
 */
import { writeMemories } from './writer.js';
import { compressContextSummary } from './summarizer.js';
import {
  popAllUnextractedMessages,
  getMemoryContextSummary,
  setMemoryContextSummary,
} from '../db/queries/redis-store.js';
import { insertConversation } from '../db/queries/memory-read.js';

/** 用户标识：PG 查询需要 userId，Redis 查询需要 platform + platformId */
export interface UserIdentifier {
  userId: string;
  platform: string;
  platformId: string;
}

/**
 * 执行一次增量记忆提取
 * 被轮次触发和延时任务共用
 */
export async function executeMemoryExtraction(user: UserIdentifier): Promise<void> {
  // 1. 原子取出全部待提取消息
  const messages = await popAllUnextractedMessages(user.platform, user.platformId);
  if (messages.length === 0) return;

  const newMessagesText = messages.join('\n');

  // 2. 读上下文总结
  const contextSummary = await getMemoryContextSummary(user.platform, user.platformId) ?? undefined;

  // 3. LLM 提取记忆 → 写 PG
  await writeMemories({
    userId: user.userId,
    newMessages: newMessagesText,
    contextSummary,
  });

  // 4. 生成新的 context_summary → 更新 Redis
  const newSummary = await compressContextSummary(
    contextSummary ?? '',
    newMessagesText,
  );
  await setMemoryContextSummary(user.platform, user.platformId, newSummary);
}

/**
 * 延时任务执行的完整流程
 * 除了提取记忆，还要持久化 context_summary 到 PG conversations 表
 */
export async function executeDelayedExtraction(user: UserIdentifier): Promise<void> {
  // 提取记忆（如果有未提取的）
  await executeMemoryExtraction(user);

  // 持久化 context_summary 到 PG
  const summary = await getMemoryContextSummary(user.platform, user.platformId);
  if (summary) {
    await insertConversation({
      userId: user.userId,
      platform: user.platform,
      summary,
    });
  }
}
