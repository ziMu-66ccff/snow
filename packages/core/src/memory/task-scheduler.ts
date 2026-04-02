/**
 * 异步任务编排层
 *
 * 负责"什么时候做什么"——把独立的任务函数组合起来。
 * 每个任务函数（记忆提取、关系评估、GC）各自独立，这里负责编排。
 *
 * 两种触发时机：
 * 1. 每 5 轮（unextracted >= 10 条）→ executePeriodicTasks
 * 2. 延时 30 分钟                  → executeIdleTasks
 */
import { writeMemories } from './writer.js';
import { generateConversationSummary } from './summarizer.js';
import {
  popAllUnextractedMessages,
  getMemoryContextSummary,
  setMemoryContextSummary,
} from '../db/queries/redis-store.js';
import { insertConversation } from '../db/queries/memory-read.js';
import { gcUserMemories } from './gc.js';
import { updateRelation } from '../relation/updater.js';

/** 用户标识：PG 查询需要 userId，Redis 查询需要 platform + platformId */
export interface UserIdentifier {
  userId: string;
  platform: string;
  platformId: string;
}

/**
 * 从 Redis 取出未提取消息并提取记忆（独立函数）
 * 返回取出的消息文本（供关系评估复用）
 */
async function extractMemories(user: UserIdentifier): Promise<string | null> {
  // 1. 原子取出全部待提取消息
  const messages = await popAllUnextractedMessages(user.platform, user.platformId);
  if (messages.length === 0) return null;

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
  const newSummary = await generateConversationSummary(
    newMessagesText,
    contextSummary,
  );
  await setMemoryContextSummary(user.platform, user.platformId, newSummary);

  return newMessagesText;
}

/**
 * 每 5 轮触发的周期性任务
 * - 提取记忆
 * - 评估关系
 */
export async function executePeriodicTasks(user: UserIdentifier): Promise<void> {
  // 提取记忆，拿到对话文本
  const messagesText = await extractMemories(user);
  if (!messagesText) return;

  // 评估关系（用同一份对话数据）
  try {
    await updateRelation(user.userId, user.platform, user.platformId, messagesText);
  } catch (err) {
    console.error('[periodic-tasks] 关系评估失败:', err);
  }
}

/**
 * 延时 30 分钟触发的空闲任务
 * - 提取记忆
 * - 评估关系
 * - 持久化摘要到 PG
 * - GC
 */
export async function executeIdleTasks(user: UserIdentifier): Promise<void> {
  // 提取记忆，拿到对话文本
  const messagesText = await extractMemories(user);

  // 评估关系（即使没有新消息，也可能需要时间衰减）
  try {
    await updateRelation(user.userId, user.platform, user.platformId, messagesText ?? '');
  } catch (err) {
    console.error('[idle-tasks] 关系评估失败:', err);
  }

  // 持久化 context_summary 到 PG
  const summary = await getMemoryContextSummary(user.platform, user.platformId);
  if (summary) {
    await insertConversation({
      userId: user.userId,
      platform: user.platform,
      summary,
    });
  }

  // GC
  try {
    await gcUserMemories(user.userId);
  } catch (err) {
    console.error('[idle-tasks] 记忆 GC 失败:', err);
  }
}
