/**
 * Redis Key 读写封装
 *
 * 所有 key 使用 platform:platformId 作为标识（可读、不依赖 DB 查询）
 * userId 只在查 PG 时使用
 *
 * Key 分组：
 * - snow:user:*    — 用户身份缓存
 * - snow:memory:*  — 记忆提取相关
 * - snow:chat:*    — 滑动窗口相关
 *
 * 统一 TTL：10 小时
 */
import { redis } from '../redis.js';

/** 统一 TTL：10 小时（秒） */
const TTL = 10 * 60 * 60;

/** 构造 Redis key 的用户标识部分 */
function userKey(platform: string, platformId: string): string {
  return `${platform}:${platformId}`;
}

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
  const data = await redis.get(`snow:user:identity:${userKey(platform, platformId)}`);
  if (!data) return null;
  return typeof data === 'string' ? JSON.parse(data) : data as CachedUserIdentity;
}

export async function setCachedUserIdentity(platform: string, platformId: string, identity: CachedUserIdentity): Promise<void> {
  await redis.set(`snow:user:identity:${userKey(platform, platformId)}`, JSON.stringify(identity), { ex: TTL });
}

// ============================================
// 记忆提取：待提取消息队列
// ============================================

/** 追加消息到待提取队列，并续期 TTL */
export async function pushUnextractedMessages(platform: string, platformId: string, ...messages: string[]): Promise<number> {
  const key = `snow:memory:unextracted:${userKey(platform, platformId)}`;
  const length = await redis.rpush(key, ...messages);
  await redis.expire(key, TTL);
  return length;
}

/** 获取待提取队列长度 */
export async function getUnextractedLength(platform: string, platformId: string): Promise<number> {
  return redis.llen(`snow:memory:unextracted:${userKey(platform, platformId)}`);
}

/**
 * 原子取出全部待提取消息
 * 用 rename 防止取出期间新消息丢失
 */
export async function popAllUnextractedMessages(platform: string, platformId: string): Promise<string[]> {
  const key = `snow:memory:unextracted:${userKey(platform, platformId)}`;
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

export async function getMemoryContextSummary(platform: string, platformId: string): Promise<string | null> {
  const val = await redis.get(`snow:memory:context_summary:${userKey(platform, platformId)}`);
  return val ? String(val) : null;
}

export async function setMemoryContextSummary(platform: string, platformId: string, summary: string): Promise<void> {
  await redis.set(`snow:memory:context_summary:${userKey(platform, platformId)}`, summary, { ex: TTL });
}

// ============================================
// 滑动窗口：对话总结
// ============================================

export async function getChatSummary(platform: string, platformId: string): Promise<string | null> {
  const val = await redis.get(`snow:chat:summary:${userKey(platform, platformId)}`);
  return val ? String(val) : null;
}

export async function setChatSummary(platform: string, platformId: string, summary: string, summarizedUpTo: number): Promise<void> {
  const uk = userKey(platform, platformId);
  await redis.set(`snow:chat:summary:${uk}`, summary, { ex: TTL });
  await redis.set(`snow:chat:summarized_up_to:${uk}`, String(summarizedUpTo), { ex: TTL });
}

export async function getChatSummarizedUpTo(platform: string, platformId: string): Promise<number> {
  const val = await redis.get(`snow:chat:summarized_up_to:${userKey(platform, platformId)}`);
  return val ? parseInt(String(val), 10) : 0;
}

/** 清空滑动窗口状态（新会话时） */
export async function clearChatSummary(platform: string, platformId: string): Promise<void> {
  const uk = userKey(platform, platformId);
  await redis.del(`snow:chat:summary:${uk}`);
  await redis.del(`snow:chat:summarized_up_to:${uk}`);
}

// ============================================
// 清理全部 Redis key（测试用）
// ============================================

export async function clearAllRedisKeys(platform: string, platformId: string): Promise<void> {
  const uk = userKey(platform, platformId);
  const keys = [
    `snow:user:identity:${uk}`,
    `snow:memory:unextracted:${uk}`,
    `snow:memory:unextracted:${uk}:processing`,
    `snow:memory:context_summary:${uk}`,
    `snow:chat:summary:${uk}`,
    `snow:chat:summarized_up_to:${uk}`,
  ];
  for (const key of keys) {
    await redis.del(key);
  }
}
