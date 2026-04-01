/**
 * Redis Key 读写封装
 *
 * Snow 的 Redis 存储分两类：
 * - snow:memory:* — 记忆提取相关（unextracted 队列、上下文总结）
 * - snow:chat:* — 滑动窗口相关（对话总结、总结覆盖位置）
 * - snow:user:* — 用户身份缓存
 *
 * 所有 key 统一 10 小时 TTL
 */
import { redis } from '../redis.js';

/** 统一 TTL：10 小时（秒） */
const TTL = 10 * 60 * 60;

// ============================================
// 用户身份缓存
// ============================================

export interface CachedUserIdentity {
  userId: string;
  userName: string;
  role: string;
  stage: string;
  intimacyScore: number;
}

export async function getCachedUserIdentity(platform: string, platformId: string): Promise<CachedUserIdentity | null> {
  const data = await redis.get(`snow:user:identity:${platform}:${platformId}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as CachedUserIdentity;
}

export async function setCachedUserIdentity(platform: string, platformId: string, identity: CachedUserIdentity): Promise<void> {
  await redis.set(`snow:user:identity:${platform}:${platformId}`, JSON.stringify(identity), { ex: TTL });
}

// ============================================
// 记忆提取：待提取消息队列
// ============================================

/** 追加消息到待提取队列，并续期 TTL */
export async function pushUnextractedMessages(userId: string, ...messages: string[]): Promise<number> {
  const key = `snow:memory:unextracted:${userId}`;
  const length = await redis.rpush(key, ...messages);
  await redis.expire(key, TTL);
  return length;
}

/** 获取待提取队列长度 */
export async function getUnextractedLength(userId: string): Promise<number> {
  return redis.llen(`snow:memory:unextracted:${userId}`);
}

/**
 * 原子取出全部待提取消息
 * 用 rename 防止取出期间新消息丢失
 */
export async function popAllUnextractedMessages(userId: string): Promise<string[]> {
  const key = `snow:memory:unextracted:${userId}`;
  const tempKey = `${key}:processing`;

  try {
    await redis.rename(key, tempKey);
  } catch {
    // key 不存在时 rename 会报错，说明没有待提取消息
    return [];
  }

  const messages = await redis.lrange(tempKey, 0, -1);
  await redis.del(tempKey);
  return messages;
}

// ============================================
// 记忆提取：上下文总结
// ============================================

export async function getMemoryContextSummary(userId: string): Promise<string | null> {
  const val = await redis.get(`snow:memory:context_summary:${userId}`);
  return val ? String(val) : null;
}

export async function setMemoryContextSummary(userId: string, summary: string): Promise<void> {
  await redis.set(`snow:memory:context_summary:${userId}`, summary, { ex: TTL });
}

// ============================================
// 滑动窗口：对话总结
// ============================================

export async function getChatSummary(userId: string): Promise<string | null> {
  const val = await redis.get(`snow:chat:summary:${userId}`);
  return val ? String(val) : null;
}

export async function setChatSummary(userId: string, summary: string, summarizedUpTo: number): Promise<void> {
  await redis.set(`snow:chat:summary:${userId}`, summary, { ex: TTL });
  await redis.set(`snow:chat:summarized_up_to:${userId}`, String(summarizedUpTo), { ex: TTL });
}

export async function getChatSummarizedUpTo(userId: string): Promise<number> {
  const val = await redis.get(`snow:chat:summarized_up_to:${userId}`);
  return val ? parseInt(String(val), 10) : 0;
}

/** 清空滑动窗口状态（新会话时） */
export async function clearChatSummary(userId: string): Promise<void> {
  await redis.del(`snow:chat:summary:${userId}`);
  await redis.del(`snow:chat:summarized_up_to:${userId}`);
}
