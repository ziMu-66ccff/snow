/**
 * 关系更新器
 *
 * 基于 LLM 分析的信号增量，更新亲密度和关系阶段。
 * 来源：doc/tech/modules/relation-system.md § 四-六
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { userRelations } from '../db/schema.js';
import { setCachedUserIdentity, getCachedUserIdentity } from '../db/queries/redis-store.js';
import { evaluateRelationSignals } from './evaluator.js';

/** 五维权重 */
const WEIGHTS = {
  interactionFreq: 0.15,
  conversationDepth: 0.25,
  emotionalIntensity: 0.25,
  trustLevel: 0.25,
  timespan: 0.10,
};

/** 学习率 */
const LEARNING_RATE_UP = 0.1;       // 升级
const LEARNING_RATE_DOWN = 0.033;   // 降级（升级的 1/3）
const LEARNING_RATE_RECOVERY = 0.15; // 恢复加速（曾经亲密的用户）

/** 亲密度保底值 */
const MIN_INTIMACY = 5;

/** 阶段阈值 */
function determineStage(score: number): string {
  if (score < 20) return 'stranger';
  if (score < 50) return 'familiar';
  if (score < 75) return 'trusted';
  return 'intimate';
}

/** 计算 timespan 维度（基于互动时长） */
function calculateTimespan(createdAt: Date, now: Date): number {
  const days = Math.abs(now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return Math.min(0.3, days / 7 * 0.3);
  if (days <= 30) return 0.3 + (days - 7) / 23 * 0.3;
  if (days <= 90) return 0.6 + (days - 30) / 60 * 0.2;
  return Math.min(1.0, 0.8 + (days - 90) / 180 * 0.2);
}

/** 计算时间衰减（空闲降级） */
function calculateIdleDecay(lastInteraction: Date | null, now: Date): number {
  if (!lastInteraction) return 0;
  const days = Math.abs(now.getTime() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 0;
  return Math.min(10, (days / 30) * 2); // 每月约降 2 分，最多降 10 分
}

export interface UpdateResult {
  oldScore: number;
  newScore: number;
  oldStage: string;
  newStage: string;
  stageChanged: boolean;
  skipped: boolean;       // owner 跳过
}

/**
 * 评估并更新关系
 *
 * @param userId - 用户 UUID
 * @param platform - 平台
 * @param platformId - 平台用户 ID
 * @param conversationMessages - 对话文本（空字符串 = 仅做时间衰减）
 */
export async function updateRelation(
  userId: string,
  platform: string,
  platformId: string,
  conversationMessages: string,
): Promise<UpdateResult> {
  // 读当前关系
  const relation = await db.query.userRelations.findFirst({
    where: eq(userRelations.userId, userId),
  });

  if (!relation) {
    return { oldScore: 0, newScore: 0, oldStage: 'stranger', newStage: 'stranger', stageChanged: false, skipped: true };
  }

  // owner 不评估
  if (relation.role === 'owner') {
    return {
      oldScore: relation.intimacyScore,
      newScore: relation.intimacyScore,
      oldStage: relation.stage,
      newStage: relation.stage,
      stageChanged: false,
      skipped: true,
    };
  }

  const now = new Date();
  const oldScore = relation.intimacyScore;
  const oldStage = relation.stage;

  // === 时间衰减 ===
  const idleDecay = calculateIdleDecay(relation.lastInteraction, now);
  let currentScore = Math.max(MIN_INTIMACY, oldScore - idleDecay);

  // === 如果有对话内容，做信号分析 ===
  let newSignals = {
    interactionFreq: relation.signalInteractionFreq,
    conversationDepth: relation.signalConversationDepth,
    emotionalIntensity: relation.signalEmotionalIntensity,
    trustLevel: relation.signalTrustLevel,
    timespan: relation.signalTimespan,
  };

  if (conversationMessages.length > 0) {
    // LLM 分析 4 维信号
    const signals = await evaluateRelationSignals(conversationMessages);

    // 计算 timespan（代码算）
    const userRecord = await db.query.users.findFirst({
      where: eq(userRelations.userId, userId),
      columns: { createdAt: true },
    });
    const timespanValue = userRecord
      ? calculateTimespan(userRecord.createdAt, now)
      : 0;

    // 选择学习率
    const selectLearningRate = (delta: number): number => {
      if (delta >= 0) {
        // 曾经亲密过（oldScore > 50 但当前 < 50）→ 恢复加速
        if (oldScore < 50 && relation.signalTrustLevel > 0.3) {
          return LEARNING_RATE_RECOVERY;
        }
        return LEARNING_RATE_UP;
      }
      return LEARNING_RATE_DOWN;
    };

    // 更新五维分数
    const updateSignal = (old: number, delta: number): number => {
      const lr = selectLearningRate(delta);
      return Math.max(0, Math.min(1, old + delta * lr));
    };

    newSignals = {
      interactionFreq: updateSignal(relation.signalInteractionFreq, signals.interactionFreq),
      conversationDepth: updateSignal(relation.signalConversationDepth, signals.conversationDepth),
      emotionalIntensity: updateSignal(relation.signalEmotionalIntensity, signals.emotionalIntensity),
      trustLevel: updateSignal(relation.signalTrustLevel, signals.trustLevel),
      timespan: timespanValue, // timespan 直接赋值，不用学习率
    };

    // 加权计算亲密度
    currentScore = Math.round(
      (newSignals.interactionFreq * WEIGHTS.interactionFreq +
       newSignals.conversationDepth * WEIGHTS.conversationDepth +
       newSignals.emotionalIntensity * WEIGHTS.emotionalIntensity +
       newSignals.trustLevel * WEIGHTS.trustLevel +
       newSignals.timespan * WEIGHTS.timespan) * 100,
    );
    currentScore = Math.max(MIN_INTIMACY, Math.min(100, currentScore));
  }

  // 判定阶段
  const newStage = determineStage(currentScore);

  // 写 PG
  await db.update(userRelations)
    .set({
      intimacyScore: currentScore,
      stage: newStage,
      signalInteractionFreq: newSignals.interactionFreq,
      signalConversationDepth: newSignals.conversationDepth,
      signalEmotionalIntensity: newSignals.emotionalIntensity,
      signalTrustLevel: newSignals.trustLevel,
      signalTimespan: newSignals.timespan,
      interactionCount: relation.interactionCount + (conversationMessages.length > 0 ? 1 : 0),
      lastInteraction: now,
      updatedAt: now,
    })
    .where(eq(userRelations.userId, userId));

  // 更新 Redis 身份缓存
  const cached = await getCachedUserIdentity(platform, platformId);
  if (cached) {
    await setCachedUserIdentity(platform, platformId, {
      ...cached,
      intimacyScore: currentScore,
      stage: newStage,
    });
  }

  return {
    oldScore,
    newScore: currentScore,
    oldStage,
    newStage,
    stageChanged: oldStage !== newStage,
    skipped: false,
  };
}
