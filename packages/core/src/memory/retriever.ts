import { embed } from 'ai';
import { getEmbeddingModel } from '../ai/models.js';
import { memoryVividness } from './vividness.js';
import {
  getBasicFacts,
  getLastConversationSummary,
  vectorSearchMemories,
  reinforceMemories,
} from '../db/queries/memory-read.js';

export interface RetrievedMemories {
  /** 基本事实，格式化为文本 */
  basicFacts: string | undefined;
  /** 上次对话摘要 */
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
 * 来源：doc/tech/modules/memory-system.md § 五
 */
export async function retrieveMemories(
  userId: string,
  userMessage: string,
  relation: RelationInfo,
): Promise<RetrievedMemories> {
  // === 必选池 ===

  // 基本事实
  const facts = await getBasicFacts(userId);
  const basicFacts = facts.length > 0
    ? facts.map(f => `- ${f.key}: ${f.value}`).join('\n')
    : undefined;

  // 上次对话摘要
  const lastConvo = await getLastConversationSummary(userId);
  const lastConversationSummary = lastConvo?.summary ?? undefined;

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
