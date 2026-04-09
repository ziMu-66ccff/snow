import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getDeepSeekChat } from '../ai/models.js';
import {
  getCachedEmotionState,
  setCachedEmotionState,
  getCachedEmotionTrend,
  setCachedEmotionTrend,
  getMemoryContextSummary,
  peekUnextractedMessages,
} from '../db/queries/redis-store.js';
import {
  getLatestEmotionSnapshot,
  getRecentEmotionSnapshots,
  insertEmotionSnapshot,
  getEmotionTrendSummary,
  upsertEmotionTrendSummary,
} from '../db/queries/emotion.js';
import { buildEmotionEvaluationPrompt } from '../prompts/emotion-evaluation.js';
import { buildEmotionTrendSummaryPrompt } from '../prompts/emotion-trend-summary.js';

/** Redis 热情绪的有效窗口（小时） */
const EMOTION_TTL_HOURS = 4;
/** 超过这个时间后，情绪应逐步回到 neutral（小时） */
const EMOTION_IDLE_NEUTRAL_HOURS = 72;
/** 强事件直切阈值：超过这个分数允许直接切换主情绪 */
const SHOCK_THRESHOLD = 0.75;
/** 强度变化超过这个值时，认为值得写入历史 */
const HISTORY_DELTA = 0.15;
/** 情绪升温时的 EMA 系数 */
const ALPHA_UP = 0.35;
/** 情绪降温时的 EMA 系数 */
const ALPHA_DOWN = 0.22;

const emotionTypeSchema = z.enum([
  'happy',
  'caring',
  'sad',
  'playful',
  'worried',
  'annoyed',
  'missing',
  'neutral',
]);

const emotionAnalysisSchema = z.object({
  eventType: z.enum(['normal', 'grief', 'offense', 'risk']),
  targetEmotion: emotionTypeSchema,
  targetIntensity: z.number().min(0).max(1),
  shockScore: z.number().min(0).max(1),
  reason: z.string().min(1).max(120),
});

export type EmotionType = z.infer<typeof emotionTypeSchema>;

export interface EmotionState {
  primary: EmotionType;
  intensity: number;
  lastUpdated: string;
}

export interface EmotionContext {
  state: EmotionState;
  trendSummary?: string;
  contextSummary?: string;
  unextractedMessages: string[];
}

const DEFAULT_EMOTION_STATE: EmotionState = {
  primary: 'neutral',
  intensity: 0.25,
  lastUpdated: new Date(0).toISOString(),
};

/**
 * 将数值限制在 0-1 之间。
 *
 * @param value - 原始数值
 * @returns 限制后的数值
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 计算距离某个时间点过去了多少小时。
 *
 * @param value - ISO 时间字符串或 Date 对象
 * @returns 过去的小时数；如果时间非法，则返回一个较大的兜底值
 */
function hoursSince(value: string | Date): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(time)) return EMOTION_IDLE_NEUTRAL_HOURS;
  return Math.max(0, (Date.now() - time) / (1000 * 60 * 60));
}

/**
 * 把外部读取到的情绪状态规范化成内部统一格式。
 *
 * 这个方法主要用于处理两类数据源：
 * - Redis 中缓存的热状态
 * - PG 中恢复出来的冷快照
 *
 * @param state - 外部状态对象，字段可能缺失或不合法
 * @returns 可安全参与后续计算的标准 EmotionState
 */
function normalizeState(state: {
  primary?: string;
  intensity?: number;
  lastUpdated?: string;
} | null | undefined): EmotionState {
  if (!state) return { ...DEFAULT_EMOTION_STATE, lastUpdated: new Date().toISOString() };

  const primary = emotionTypeSchema.safeParse(state.primary);
  return {
    primary: primary.success ? primary.data : 'neutral',
    intensity: clamp01(Number(state.intensity ?? DEFAULT_EMOTION_STATE.intensity)),
    lastUpdated: typeof state.lastUpdated === 'string'
      ? state.lastUpdated
      : new Date().toISOString(),
  };
}

/**
 * 根据时间流逝对情绪做自然回落。
 *
 * 规则来自文档：
 * - Redis 命中时：只做轻量衰减
 * - 从 PG 冷恢复时：做完整衰减
 * - 亲密度会影响衰减速度
 *
 * @param state - 当前情绪状态
 * @param intimacyScore - 当前用户亲密度（0-100）
 * @param isColdRestore - 是否为冷恢复场景
 * @returns 衰减后的情绪状态
 */
function applyDecay(
  state: EmotionState,
  intimacyScore: number,
  isColdRestore: boolean,
): EmotionState {
  const elapsedHours = hoursSince(state.lastUpdated);
  if (elapsedHours <= 0) return state;

  const decayHours = isColdRestore ? elapsedHours : Math.min(elapsedHours, EMOTION_TTL_HOURS);
  const intimacyFactor = intimacyScore / 100;

  let rate = 0.08;
  switch (state.primary) {
    case 'happy':
    case 'missing':
    case 'caring':
    case 'worried':
    case 'sad':
      rate = 0.08 - intimacyFactor * 0.03;
      break;
    case 'annoyed':
      rate = 0.16 + intimacyFactor * 0.06;
      break;
    case 'playful':
      rate = 0.11;
      break;
    case 'neutral':
      return state;
  }

  // 不同情绪按不同速率回落；亲密度高时，关心/开心会停留更久，annoyed 会消得更快。
  const nextIntensity = clamp01(state.intensity - decayHours * rate);
  const shouldNeutralize = elapsedHours >= EMOTION_IDLE_NEUTRAL_HOURS || nextIntensity <= 0.18;

  return {
    primary: shouldNeutralize ? 'neutral' : state.primary,
    intensity: shouldNeutralize ? 0.2 : nextIntensity,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 判断这次情绪变化是否值得写入 `emotion_states`。
 *
 * 写入的目的不是记录每一次微小波动，而是保留：
 * - 主情绪变化
 * - 明显强度变化
 * - 强事件触发
 *
 * @param previous - 变化前状态
 * @param next - 变化后状态
 * @param shockScore - 本轮事件冲击度
 * @returns 是否需要写入历史表
 */
function shouldWriteSnapshot(previous: EmotionState, next: EmotionState, shockScore: number): boolean {
  if (previous.primary !== next.primary) return true;
  if (Math.abs(previous.intensity - next.intensity) >= HISTORY_DELTA) return true;
  return shockScore >= SHOCK_THRESHOLD;
}

/**
 * 把 LLM 的分析结果合并到当前情绪，得到新的情绪状态。
 *
 * 这个方法实现了两种核心机制：
 * - 常规变化：EMA 平滑过渡
 * - 强事件：允许直接切换主情绪
 *
 * @param current - 当前情绪状态
 * @param analysis - LLM 返回的目标情绪分析
 * @returns 新的情绪状态
 */
function mergeEmotionState(
  current: EmotionState,
  analysis: z.infer<typeof emotionAnalysisSchema>,
): EmotionState {
  // grief / offense / risk 且冲击度足够高时，允许直接切换主情绪。
  if (analysis.eventType !== 'normal' && analysis.shockScore >= SHOCK_THRESHOLD) {
    return {
      primary: analysis.targetEmotion,
      intensity: Math.max(0.75, analysis.targetIntensity),
      lastUpdated: new Date().toISOString(),
    };
  }

  // 主情绪不变时，只调整强度。
  if (analysis.targetEmotion === current.primary) {
    const alpha = analysis.targetIntensity >= current.intensity ? ALPHA_UP : ALPHA_DOWN;
    return {
      primary: current.primary,
      intensity: clamp01(current.intensity * (1 - alpha) + analysis.targetIntensity * alpha),
      lastUpdated: new Date().toISOString(),
    };
  }

  // 主情绪不同时，不是每次都立刻切换。
  // 这里用一组门槛判断“新情绪是不是已经足够强，值得接管当前状态”。
  const strongEnoughToSwitch =
    current.primary === 'neutral'
    || current.intensity <= 0.4
    || analysis.targetIntensity >= 0.55
    || analysis.targetIntensity >= current.intensity + 0.1;

  // 新情绪足够强，则切换主情绪，但强度仍然做平滑。
  if (strongEnoughToSwitch) {
    return {
      primary: analysis.targetEmotion,
      intensity: clamp01(current.intensity * (1 - ALPHA_UP) + analysis.targetIntensity * ALPHA_UP),
      lastUpdated: new Date().toISOString(),
    };
  }

  // 否则先保留当前主情绪，只让它轻微回落，避免一条普通消息造成突兀跳变。
  return {
    primary: current.primary,
    intensity: clamp01(current.intensity * (1 - ALPHA_DOWN)),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 调用 LLM 分析当前这轮应该进入什么情绪。
 *
 * 输入不仅包括当前消息，还包括：
 * - 当前情绪
 * - 长上下文摘要
 * - 最近尚未压缩的几轮对话
 * - 最近趋势摘要
 *
 * @param params - 当前轮情绪分析所需输入
 * @returns 结构化的情绪分析结果
 */
async function analyzeEmotion(params: {
  currentState: EmotionState;
  currentMessage: string;
  contextSummary?: string;
  unextractedMessages: string[];
  trendSummary?: string;
}) {
  const { output } = await generateText({
    model: getDeepSeekChat(),
    output: Output.object({ schema: emotionAnalysisSchema }),
    prompt: buildEmotionEvaluationPrompt({
      currentEmotion: params.currentState.primary,
      currentIntensity: params.currentState.intensity,
      contextSummary: params.contextSummary,
      unextractedMessages: params.unextractedMessages,
      trendSummary: params.trendSummary,
      currentMessage: params.currentMessage,
    }),
  });

  if (!output) {
    return {
      eventType: 'normal' as const,
      targetEmotion: 'neutral' as const,
      targetIntensity: 0.3,
      shockScore: 0,
      reason: '没有足够的情绪信号',
    };
  }

  return output;
}

/**
 * 用最近几次情绪快照，异步归纳一段趋势摘要。
 *
 * 这个摘要不是“当前情绪”，而是给下一轮 Prompt 用的背景信息。
 *
 * @param userId - 用户 ID
 * @returns 1-2 句趋势摘要；如果没有足够数据则返回 null
 */
async function summarizeEmotionTrend(userId: string): Promise<string | null> {
  const snapshots = await getRecentEmotionSnapshots(userId, 6);
  if (snapshots.length === 0) return null;

  // 读库时是倒序，这里翻回正序，让 LLM 更容易理解时间线。
  const ordered = [...snapshots].reverse();
  const { text } = await generateText({
    model: getDeepSeekChat(),
    prompt: buildEmotionTrendSummaryPrompt({ snapshots: ordered }),
  });

  const summary = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  return summary.length > 0 ? summary : null;
}

/**
 * 获取当前轮情绪计算所需的完整上下文。
 *
 * 读取顺序：
 * 1. 先读 Redis 热状态
 * 2. Redis miss 时，从 `emotion_states` 最新快照冷恢复
 * 3. 同时补齐上下文摘要、未提取对话和趋势摘要
 *
 * @param params.userId - 用户 UUID
 * @param params.platform - 平台标识
 * @param params.platformId - 平台内用户 ID
 * @param params.intimacyScore - 当前亲密度，用于衰减计算
 * @returns 当前情绪上下文
 */
export async function getEmotionContext(params: {
  userId: string;
  platform: string;
  platformId: string;
  intimacyScore: number;
}): Promise<EmotionContext> {
  const [cachedState, cachedTrend, contextSummary, unextractedMessages, latestTrend] = await Promise.all([
    getCachedEmotionState(params.platform, params.platformId),
    getCachedEmotionTrend(params.platform, params.platformId),
    getMemoryContextSummary(params.platform, params.platformId),
    peekUnextractedMessages(params.platform, params.platformId, 10),
    getEmotionTrendSummary(params.userId),
  ]);

  if (cachedState) {
    return {
      state: applyDecay(normalizeState(cachedState), params.intimacyScore, false),
      trendSummary: cachedTrend ?? latestTrend ?? undefined,
      contextSummary: contextSummary ?? undefined,
      unextractedMessages,
    };
  }

  // Redis 里没有当前情绪时，从 PG 最新快照恢复，并做完整时间衰减。
  const latestSnapshot = await getLatestEmotionSnapshot(params.userId);

  const restored = latestSnapshot
    ? applyDecay(
        normalizeState({
          primary: latestSnapshot.primaryEmotion,
          intensity: latestSnapshot.intensity,
          lastUpdated: latestSnapshot.createdAt.toISOString(),
        }),
        params.intimacyScore,
        true,
      )
    : { ...DEFAULT_EMOTION_STATE, lastUpdated: new Date().toISOString() };

  return {
    state: restored,
    trendSummary: cachedTrend ?? latestTrend ?? undefined,
    contextSummary: contextSummary ?? undefined,
    unextractedMessages,
  };
}

/**
 * 在当前轮回复前更新情绪状态。
 *
 * 这是主链路入口：
 * - 先读取上下文
 * - 再调用 LLM 做结构化分析
 * - 最后合并成新的情绪状态并写入 Redis
 *
 * @param params.userId - 用户 UUID
 * @param params.platform - 平台标识
 * @param params.platformId - 平台内用户 ID
 * @param params.intimacyScore - 当前亲密度
 * @param params.currentMessage - 当前用户消息
 * @returns 新的情绪状态、趋势摘要和本轮分析结果
 */
export async function updateEmotionState(params: {
  userId: string;
  platform: string;
  platformId: string;
  intimacyScore: number;
  currentMessage: string;
}) {
  const context = await getEmotionContext(params);
  const analysis = await analyzeEmotion({
    currentState: context.state,
    currentMessage: params.currentMessage,
    contextSummary: context.contextSummary,
    unextractedMessages: context.unextractedMessages,
    trendSummary: context.trendSummary,
  });

  const nextState = mergeEmotionState(context.state, analysis);

  await setCachedEmotionState(params.platform, params.platformId, nextState);

  // 只在有意义的变化时写历史表，避免把细小抖动全部落库。
  if (shouldWriteSnapshot(context.state, nextState, analysis.shockScore)) {
    await insertEmotionSnapshot({
      userId: params.userId,
      primaryEmotion: nextState.primary,
      intensity: nextState.intensity,
      trigger: analysis.reason.slice(0, 256),
    });
  }

  return {
    state: nextState,
    trendSummary: context.trendSummary,
    analysis,
  };
}

/**
 * 在会话结束（30 分钟 idle）时，把当前热状态强制写一条快照到 `emotion_states`。
 *
 * 这样即使 Redis 过期，下次也能从 PG 恢复最近一次情绪基线。
 *
 * @param params.userId - 用户 UUID
 * @param params.platform - 平台标识
 * @param params.platformId - 平台内用户 ID
 * @returns 插入结果；如果当前没有热状态，则返回 null
 */
export async function persistEmotionSnapshot(params: {
  userId: string;
  platform: string;
  platformId: string;
}) {
  const cached = await getCachedEmotionState(params.platform, params.platformId);
  if (!cached) return null;

  return insertEmotionSnapshot({
    userId: params.userId,
    primaryEmotion: cached.primary,
    intensity: clamp01(cached.intensity),
    trigger: 'idle snapshot',
  });
}

/**
 * 刷新情绪趋势摘要。
 *
 * 这个方法通常在 idle 任务里调用：
 * - 从最近的情绪快照生成 1-2 句趋势摘要
 * - 写入 Redis 热缓存
 * - 写入 PG 冷数据表 `emotion_trends`
 *
 * @param params.userId - 用户 UUID
 * @param params.platform - 平台标识
 * @param params.platformId - 平台内用户 ID
 * @returns 最新趋势摘要；若无法生成则返回 null
 */
export async function refreshEmotionTrendSummary(params: {
  userId: string;
  platform: string;
  platformId: string;
}) {
  const summary = await summarizeEmotionTrend(params.userId);
  if (!summary) return null;

  const dominantEmotion = await getLatestEmotionSnapshot(params.userId);
  await Promise.all([
    setCachedEmotionTrend(params.platform, params.platformId, summary),
    upsertEmotionTrendSummary({
      userId: params.userId,
      summary,
      dominantEmotion: dominantEmotion?.primaryEmotion,
    }),
  ]);

  return summary;
}
