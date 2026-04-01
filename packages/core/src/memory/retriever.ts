import { embed } from 'ai';
import { getEmbeddingModel } from '../ai/models.js';
import { memoryVividness } from './vividness.js';
import {
  getBasicFacts,
  getLastConversationSummary,
  vectorSearchMemories,
  reinforceMemories,
} from '../db/queries/memory-read.js';
import { getMemoryContextSummary } from '../db/queries/redis-store.js';

export interface RetrievedMemories {
  /** 基本事实，格式化为文本 */
  basicFacts: string | undefined;
  /** 上次对话摘要（注入 Prompt 让 Snow 知道之前聊了什么） */
  lastConversationSummary: string | undefined;
  /** 动态检索到的语义记忆，格式化为文本 */
  dynamicMemories: string | undefined;
}

interface RelationInfo {
  intimacyScore: number;
}

/** 相似度门槛：低于此值的记忆视为不相关，直接过滤 */
const SIMILARITY_THRESHOLD = 0.3;

/** 候选池大小：pgvector 搜索的候选数量 */
const CANDIDATE_POOL_SIZE = 50;

/** 最终注入 Prompt 的最大记忆条数 */
const MAX_INJECTED_MEMORIES = 8;

/** 综合得分权重 */
const WEIGHT_SIMILARITY = 0.6;
const WEIGHT_VIVIDNESS = 0.4;

/**
 * 记忆检索器
 * 内部固定使用 OpenRouter Embedding（向量化查询）
 *
 * 两池策略：
 * - 必选池：用户基本事实 + 上次对话摘要（每次都带）
 * - 动态池：两阶段筛选
 *   1. 相似度门槛过滤（排除不相关的记忆）
 *   2. 综合排序：similarity × 0.6 + normalized_vividness × 0.4
 *
 * 上次对话摘要的取法：
 * - 非新会话（history 有多条消息）：只从 PG 取（Redis 是当前会话的，和 history 重叠）
 * - 新会话（history 只有一条 user 消息）：优先 Redis（最新鲜）→ PG 兜底
 *
 * @param userId - 用户 UUID（查 PG 用）
 * @param userMessage - 当前用户消息文本（向量化查询用）
 * @param relation - 关系信息（鲜活度计算用）
 * @param isNewSession - 是否是新会话（影响上次摘要的取法）
 * @param platform - 平台标识（读 Redis 用，新会话时需要）
 * @param platformId - 平台用户 ID（读 Redis 用，新会话时需要）
 */
export async function retrieveMemories(
  userId: string,
  userMessage: string,
  relation: RelationInfo,
  isNewSession: boolean,
  platform: string,
  platformId: string,
): Promise<RetrievedMemories> {
  // === 必选池 ===

  // 基本事实
  const facts = await getBasicFacts(userId);
  const basicFacts = facts.length > 0
    ? facts.map(f => `- ${f.key}: ${f.value}`).join('\n')
    : undefined;

  // 上次对话摘要
  // - 非新会话：当前会话的上下文在 history 里（或被滑动窗口压缩过），
  //   Redis 里的 context_summary 是当前会话的记忆提取产生的，和 history 重叠。
  //   只需要从 PG 取更早的"上次对话"摘要。
  // - 新会话：history 没有上下文，优先从 Redis 取（可能是刚结束还没持久化的上一段对话），
  //   Redis 没有再从 PG 取。
  let lastConversationSummary: string | undefined;
  if (isNewSession) {
    const redisSummary = await getMemoryContextSummary(platform, platformId);
    if (redisSummary) {
      lastConversationSummary = redisSummary;
    } else {
      const pgConvo = await getLastConversationSummary(userId);
      lastConversationSummary = pgConvo?.summary ?? undefined;
    }
  } else {
    const pgConvo = await getLastConversationSummary(userId);
    lastConversationSummary = pgConvo?.summary ?? undefined;
  }

  // === 动态池 ===

  // 1. 向量化当前消息
  const { embedding: queryVec } = await embed({
    model: getEmbeddingModel(),
    value: userMessage,
  });

  // 2. pgvector 搜索候选
  const candidates = await vectorSearchMemories(userId, queryVec, CANDIDATE_POOL_SIZE);

  // 3. 阶段一：相似度门槛过滤（排除不相关的记忆）
  const relevant = candidates.filter(c => c.similarity >= SIMILARITY_THRESHOLD);

  if (relevant.length === 0) {
    return { basicFacts, lastConversationSummary, dynamicMemories: undefined };
  }

  // 4. 计算鲜活度
  const withVividness = relevant.map(c => ({
    ...c,
    vividness: memoryVividness(
      {
        importance: c.importance,
        emotionalIntensity: c.emotional_intensity,
        accessCount: c.access_count,
        createdAt: new Date(c.created_at),
      },
      relation,
    ),
  }));

  // 5. 阶段二：归一化鲜活度 + 综合排序
  const maxVividness = Math.max(...withVividness.map(m => m.vividness));
  const scored = withVividness.map(m => ({
    ...m,
    normalizedVividness: maxVividness > 0 ? m.vividness / maxVividness : 0,
    finalScore:
      m.similarity * WEIGHT_SIMILARITY +
      (maxVividness > 0 ? m.vividness / maxVividness : 0) * WEIGHT_VIVIDNESS,
  }));

  scored.sort((a, b) => b.finalScore - a.finalScore);
  const selected = scored.slice(0, MAX_INJECTED_MEMORIES);

  // 6. 强化！被想起来了 → accessCount++
  if (selected.length > 0) {
    await reinforceMemories(selected.map(m => m.id));
  }

  const dynamicMemories = selected.length > 0
    ? selected.map(m => `- ${m.content}`).join('\n')
    : undefined;

  return {
    basicFacts,
    lastConversationSummary,
    dynamicMemories,
  };
}
