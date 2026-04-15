import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { emotionStates, emotionTrends } from '../schema';

export interface EmotionSnapshotRow {
  primaryEmotion: string;
  intensity: number;
  trigger: string | null;
  createdAt: Date;
}

export async function getLatestEmotionSnapshot(userId: string): Promise<EmotionSnapshotRow | null> {
  const row = await db.query.emotionStates.findFirst({
    where: eq(emotionStates.userId, userId),
    orderBy: [desc(emotionStates.createdAt)],
    columns: {
      primaryEmotion: true,
      intensity: true,
      trigger: true,
      createdAt: true,
    },
  });
  return row ?? null;
}

export async function getRecentEmotionSnapshots(
  userId: string,
  limit: number = 6,
): Promise<EmotionSnapshotRow[]> {
  return db.query.emotionStates.findMany({
    where: eq(emotionStates.userId, userId),
    orderBy: [desc(emotionStates.createdAt)],
    limit,
    columns: {
      primaryEmotion: true,
      intensity: true,
      trigger: true,
      createdAt: true,
    },
  });
}

export async function insertEmotionSnapshot(params: {
  userId: string;
  primaryEmotion: string;
  intensity: number;
  trigger?: string;
}) {
  const [row] = await db.insert(emotionStates)
    .values({
      userId: params.userId,
      primaryEmotion: params.primaryEmotion,
      intensity: params.intensity,
      trigger: params.trigger,
    })
    .returning({ id: emotionStates.id });

  return row;
}

export async function getEmotionTrendSummary(userId: string): Promise<string | null> {
  const row = await db.query.emotionTrends.findFirst({
    where: eq(emotionTrends.userId, userId),
    columns: { summary: true },
  });
  return row?.summary ?? null;
}

export async function upsertEmotionTrendSummary(params: {
  userId: string;
  summary: string;
  dominantEmotion?: string;
}) {
  const existing = await db.query.emotionTrends.findFirst({
    where: eq(emotionTrends.userId, params.userId),
    columns: { id: true },
  });

  if (existing) {
    await db.update(emotionTrends)
      .set({
        summary: params.summary,
        dominantEmotion: params.dominantEmotion,
        updatedAt: new Date(),
      })
      .where(eq(emotionTrends.userId, params.userId));
    return;
  }

  await db.insert(emotionTrends).values({
    userId: params.userId,
    summary: params.summary,
    dominantEmotion: params.dominantEmotion,
  });
}
