import { eq, and } from 'drizzle-orm';
import { db } from '../client';
import { factualMemories, semanticMemories } from '../schema';

/**
 * UPSERT 事实记忆
 * 同一用户同一 category+key 下只保留最新值
 */
export async function upsertFactualMemory(params: {
  userId: string;
  category: string;
  key: string;
  value: string;
  importance: number;
  source?: string;
}) {
  const existing = await db.query.factualMemories.findFirst({
    where: and(
      eq(factualMemories.userId, params.userId),
      eq(factualMemories.category, params.category),
      eq(factualMemories.key, params.key),
    ),
  });

  if (existing) {
    await db.update(factualMemories)
      .set({
        value: params.value,
        importance: params.importance,
        source: params.source,
        updatedAt: new Date(),
      })
      .where(eq(factualMemories.id, existing.id));
    return { action: 'updated' as const, id: existing.id };
  }

  const [inserted] = await db.insert(factualMemories)
    .values({
      userId: params.userId,
      category: params.category,
      key: params.key,
      value: params.value,
      importance: params.importance,
      source: params.source,
    })
    .returning({ id: factualMemories.id });

  return { action: 'inserted' as const, id: inserted.id };
}

/**
 * 插入语义记忆（含向量）
 */
export async function insertSemanticMemory(params: {
  userId: string;
  content: string;
  embedding: number[];
  importance: number;
  emotionalIntensity: number;
  topic: string;
}) {
  const [inserted] = await db.insert(semanticMemories)
    .values({
      userId: params.userId,
      content: params.content,
      embedding: params.embedding,
      importance: params.importance,
      emotionalIntensity: params.emotionalIntensity,
      topic: params.topic,
    })
    .returning({ id: semanticMemories.id });

  return inserted;
}

/**
 * 查询用户的所有事实记忆（用于传给 extractor 做冲突检测）
 */
export async function getFactualMemoriesForUser(userId: string) {
  return db.query.factualMemories.findMany({
    where: eq(factualMemories.userId, userId),
    orderBy: (m, { desc }) => [desc(m.importance)],
  });
}
