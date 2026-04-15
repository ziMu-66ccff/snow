/**
 * 记忆垃圾回收（Memory GC）
 *
 * 定期清理鲜活度极低的语义记忆（彻底遗忘）。
 * 来源：doc/tech/modules/memory-system.md § 三 "彻底遗忘"
 *
 * 建议每周运行一次（M1: 手动脚本，M2: Cron Job）
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { semanticMemories, userRelations } from '../db/schema';
import { memoryVividness } from './vividness';

/** 鲜活度低于此值的记忆会被删除（彻底遗忘） */
const GC_THRESHOLD = 0.02;

/** 重要性 >= 此值的记忆永远不删（核心记忆保护） */
const PROTECTED_IMPORTANCE = 0.9;

export interface GCResult {
  /** 扫描的记忆总数 */
  scanned: number;
  /** 删除的记忆数 */
  deleted: number;
  /** 被保护跳过的记忆数（importance >= 0.9） */
  protected: number;
}

/**
 * 对指定用户执行记忆 GC
 */
export async function gcUserMemories(userId: string): Promise<GCResult> {
  // 读取用户关系（计算鲜活度需要 intimacyScore）
  const relation = await db.query.userRelations.findFirst({
    where: eq(userRelations.userId, userId),
  });
  const intimacyScore = relation?.intimacyScore ?? 0;

  // 读取该用户所有语义记忆
  const memories = await db.query.semanticMemories.findMany({
    where: eq(semanticMemories.userId, userId),
  });

  let deleted = 0;
  let protected_ = 0;
  const now = new Date();

  for (const memory of memories) {
    // 核心记忆保护：importance >= 0.9 的永远不删
    if (memory.importance >= PROTECTED_IMPORTANCE) {
      protected_++;
      continue;
    }

    const vividness = memoryVividness(
      {
        importance: memory.importance,
        emotionalIntensity: memory.emotionalIntensity,
        accessCount: memory.accessCount,
        createdAt: memory.createdAt,
      },
      { intimacyScore },
      now,
    );

    if (vividness < GC_THRESHOLD) {
      await db.delete(semanticMemories).where(eq(semanticMemories.id, memory.id));
      deleted++;
    }
  }

  return {
    scanned: memories.length,
    deleted,
    protected: protected_,
  };
}

/**
 * 对所有用户执行记忆 GC
 */
export async function gcAllMemories(): Promise<Map<string, GCResult>> {
  const allUsers = await db.query.semanticMemories.findMany({
    columns: { userId: true },
  });

  // 去重
  const userIds = [...new Set(allUsers.map(m => m.userId))];

  const results = new Map<string, GCResult>();
  for (const userId of userIds) {
    const result = await gcUserMemories(userId);
    if (result.scanned > 0) {
      results.set(userId, result);
    }
  }

  return results;
}
