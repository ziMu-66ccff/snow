/**
 * 异步任务编排层
 *
 * 负责"什么时候做什么"——把独立的任务函数组合起来。
 * 每个任务函数（记忆提取、关系评估、GC、摘要持久化）各自独立，这里负责编排和数据流转。
 *
 * 两种触发时机：
 * 1. 每 5 轮（unextracted >= 10 条）→ executePeriodicTasks
 * 2. 延时 30 分钟                  → executeIdleTasks
 */
import {
  popAllUnextractedMessages,
  getMemoryContextSummary,
} from '../db/queries/redis-store';
import { runMemoryExtraction } from '../memory/extract';
import { persistContextSummary } from '../memory/persist-summary';
import { gcUserMemories } from '../memory/gc';
import { updateRelation } from '../relation/updater';
import { persistEmotionSnapshot, refreshEmotionTrendSummary } from '../emotion/engine';

/** 用户标识：PG 查询需要 userId，Redis 查询需要 platform + platformId */
export interface UserIdentifier {
  userId: string;
  platform: string;
  platformId: string;
}

/**
 * 每 5 轮触发的周期性任务
 * - 提取记忆
 * - 评估关系
 */
export async function executePeriodicTasks(user: UserIdentifier): Promise<void> {
  // 编排层取数据
  const messages = await popAllUnextractedMessages(user.platform, user.platformId);
  if (messages.length === 0) return;

  const messagesText = messages.join('\n');
  const contextSummary = await getMemoryContextSummary(user.platform, user.platformId) ?? undefined;

  // 记忆提取
  await runMemoryExtraction(user.userId, user.platform, user.platformId, messagesText, contextSummary);

  // 关系评估（失败不影响记忆提取）
  try {
    await updateRelation(user.userId, user.platform, user.platformId, messagesText, contextSummary);
  } catch (err) {
    console.error('[periodic-tasks] 关系评估失败:', err);
  }
}

/**
 * 延时 30 分钟触发的空闲任务
 * - 提取记忆
 * - 评估关系
 * - 持久化摘要到 PG
 * - 持久化情绪快照 + 情绪趋势摘要
 * - GC
 */
export async function executeIdleTasks(user: UserIdentifier): Promise<void> {
  // 编排层取数据
  const messages = await popAllUnextractedMessages(user.platform, user.platformId);
  const messagesText = messages.join('\n');
  const contextSummary = await getMemoryContextSummary(user.platform, user.platformId) ?? undefined;

  // 记忆提取（如果有新消息）
  if (messages.length > 0) {
    await runMemoryExtraction(user.userId, user.platform, user.platformId, messagesText, contextSummary);
  }

  // 关系评估（即使没有新消息，也做时间衰减）
  try {
    await updateRelation(user.userId, user.platform, user.platformId, messagesText, contextSummary);
  } catch (err) {
    console.error('[idle-tasks] 关系评估失败:', err);
  }

  // 持久化摘要到 PG
  try {
    await persistContextSummary(user.userId, user.platform, user.platformId);
  } catch (err) {
    console.error('[idle-tasks] 摘要持久化失败:', err);
  }

  // 持久化情绪快照 + 刷新趋势摘要
  try {
    await persistEmotionSnapshot(user);
    await refreshEmotionTrendSummary(user);
  } catch (err) {
    console.error('[idle-tasks] 情绪持久化失败:', err);
  }

  // GC
  try {
    await gcUserMemories(user.userId);
  } catch (err) {
    console.error('[idle-tasks] 记忆 GC 失败:', err);
  }
}
