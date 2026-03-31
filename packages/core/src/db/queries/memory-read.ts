import { eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../client.js';
import { factualMemories, semanticMemories, conversations } from '../schema.js';

/**
 * 获取用户的基本事实记忆（必选池）
 */
export async function getBasicFacts(userId: string) {
  return db.query.factualMemories.findMany({
    where: eq(factualMemories.userId, userId),
    orderBy: [desc(factualMemories.importance)],
  });
}

/**
 * 获取用户最近一次对话摘要（必选池）
 */
export async function getLastConversationSummary(userId: string) {
  return db.query.conversations.findFirst({
    where: eq(conversations.userId, userId),
    orderBy: [desc(conversations.startedAt)],
  });
}

/**
 * pgvector 语义搜索候选记忆
 * 返回余弦相似度最高的 N 条语义记忆
 */
export async function vectorSearchMemories(
  userId: string,
  queryEmbedding: number[],
  limit: number = 20,
) {
  const results = await db.execute(sql`
    SELECT
      id,
      content,
      importance,
      emotional_intensity,
      access_count,
      topic,
      created_at,
      1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) AS similarity
    FROM semantic_memories
    WHERE user_id = ${userId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    LIMIT ${limit}
  `);

  // Drizzle + postgres.js 的 execute 返回值可能是数组或 { rows }
  const rows = Array.isArray(results) ? results : (results as any).rows ?? [];

  return rows as Array<{
    id: string;
    content: string;
    importance: number;
    emotional_intensity: number;
    access_count: number;
    topic: string;
    created_at: string;
    similarity: number;
  }>;
}

/**
 * 强化记忆：被检索到的记忆 accessCount++
 */
export async function reinforceMemories(memoryIds: string[]) {
  if (memoryIds.length === 0) return;

  // 用 inArray 操作替代 raw SQL ANY
  await db.update(semanticMemories)
    .set({ accessCount: sql`${semanticMemories.accessCount} + 1` })
    .where(inArray(semanticMemories.id, memoryIds));
}

/**
 * 写入对话记录（含摘要）
 */
export async function insertConversation(params: {
  userId: string;
  platform: string;
  startedAt: Date;
  endedAt: Date;
  summary: string;
  emotionSnapshot?: Record<string, unknown>;
}) {
  const [inserted] = await db.insert(conversations)
    .values({
      userId: params.userId,
      platform: params.platform,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
      summary: params.summary,
      emotionSnapshot: params.emotionSnapshot,
    })
    .returning({ id: conversations.id });

  return inserted;
}
