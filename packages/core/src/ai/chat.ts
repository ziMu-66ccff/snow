/**
 * Snow 核心对话函数
 *
 * 外界只需要调这一个函数，传入 platformId + platform + messages。
 * 内部自动完成：用户身份查询、记忆检索、滑动窗口、LLM 回复、异步记忆提取。
 *
 * 对齐 Vercel AI SDK useChat 标准：
 * - messages 包含完整对话历史（含当前消息）
 * - 返回 streamText 原始结果（壳可用 toUIMessageStreamResponse / textStream 等）
 * - 记忆处理通过 onFinish 自动触发，不依赖外界
 */
import { streamText, type ModelMessage } from 'ai';
import { eq, and } from 'drizzle-orm';
import { composeSystemPrompt } from './prompts-composer';
import { getDeepSeekChat } from './models';
import { applySlidingWindow } from './sliding-window';
import { messageToText } from './message-utils';
import { retrieveMemories } from '../memory/retriever';
import { updateEmotionState } from '../emotion/engine';
import { executePeriodicTasks, executeIdleTasks } from '../scheduler/task-scheduler';
import { scheduleDelayedTask, cancelDelayedTask } from '../scheduler/delayed-task';
import { createTimer } from '../utils/perf';
import { db } from '../db/client';
import { users, userRelations } from '../db/schema';
import {
  getCachedUserIdentity,
  setCachedUserIdentity,
  pushUnextractedMessages,
  getUnextractedLength,
  type CachedUserIdentity,
} from '../db/queries/redis-store';

/** 每 N 条消息增量提取一次记忆（5 轮 = 10 条） */
const EXTRACT_EVERY_N_MESSAGES = 10;

export interface ChatInput {
  platformId: string;
  platform: string;
  /** 完整对话历史（含当前消息，对齐 AI SDK useChat 标准） */
  messages: ModelMessage[];
  /** 外部显式注入的 Snow 自定义人格指令 */
  customDirective?: string;
  /** 用户昵称（可选，没传则用 platformId） */
  name?: string;
}

/**
 * 查询用户身份（Redis 缓存 → PG 查询 → 自动创建）
 *
 * @param name - 外部传入的用户昵称，仅在自动创建新用户时使用
 */
async function resolveUserIdentity(platform: string, platformId: string, name?: string): Promise<CachedUserIdentity> {
  // Redis 缓存命中
  const cached = await getCachedUserIdentity(platform, platformId);
  if (cached) return cached;

  // 查 PG
  const user = await db.query.users.findFirst({
    where: and(eq(users.platformId, platformId), eq(users.platform, platform)),
  });

  if (!user) {
    // 未注册用户，自动创建
    const [newUser] = await db.insert(users)
      .values({ platformId, platform, name: name ?? platformId })
      .returning();

    await db.insert(userRelations)
      .values({ userId: newUser.id, role: 'user', stage: 'stranger', intimacyScore: 0 })
      .onConflictDoNothing();

    const identity: CachedUserIdentity = {
      userId: newUser.id,
      userName: newUser.name ?? platformId,
      role: 'user',
      stage: 'stranger',
      intimacyScore: 0,
    };
    await setCachedUserIdentity(platform, platformId, identity);
    return identity;
  }

  const relation = await db.query.userRelations.findFirst({
    where: eq(userRelations.userId, user.id),
  });

  if (!relation) {
    await db.insert(userRelations)
      .values({ userId: user.id, role: 'user', stage: 'stranger', intimacyScore: 0 })
      .onConflictDoNothing();
  }

  const identity: CachedUserIdentity = {
    userId: user.id,
    userName: user.name ?? platformId,
    role: relation?.role ?? 'user',
    stage: relation?.stage ?? 'stranger',
    intimacyScore: relation?.intimacyScore ?? 0,
  };

  await setCachedUserIdentity(platform, platformId, identity);
  return identity;
}

/**
 * Snow 核心对话函数
 *
 * 外界只需要传 platformId + platform + messages，其余全自动。
 * 返回 streamText 原始结果：
 * - CLI 用 result.textStream
 * - Web 用 result.toUIMessageStreamResponse()
 */
export async function getChatResponse(input: ChatInput): Promise<ReturnType<typeof streamText>> {
  const { platformId, platform, messages, customDirective, name } = input;

  // ===== 阶段 1：用户身份 =====
  const tIdentity = createTimer('用户身份');
  const identity = await resolveUserIdentity(platform, platformId, name);
  tIdentity.end();
  const { userId, userName, role, stage, intimacyScore } = identity;

  // ===== 阶段 2：上下文准备 =====

  // 判断新会话：只数 user 消息，排除 system/tool 等
  const userMessageCount = messages.filter(m => m.role === 'user').length;
  const isNewSession = userMessageCount === 1;

  // 滑动窗口处理（基于 Redis）
  const tWindow = createTimer('滑动窗口');
  const processedMessages = await applySlidingWindow(platform, platformId, messages);
  tWindow.end();

  // 提取当前用户消息的文本（取最后一条 user 消息，而非 messages 最后一条）
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const currentMessageText = lastUserMessage
    ? messageToText(lastUserMessage)
    : '';

  // 记忆检索 + 情绪计算并行执行（互不依赖，并行可省 3-8s）
  const tParallel = createTimer('记忆+情绪(并行)');
  const [memories, emotion] = await Promise.all([
    retrieveMemories(
      userId, currentMessageText, { intimacyScore },
      isNewSession, platform, platformId,
    ),
    updateEmotionState({
      userId,
      platform,
      platformId,
      intimacyScore,
      relationRole: role,
      relationStage: stage,
      currentMessage: currentMessageText,
    }),
  ]);
  tParallel.end();

  // 组装 Prompt
  const tPrompt = createTimer('Prompt组装');
  const systemPrompt = composeSystemPrompt({
    userId,
    userName,
    relationRole: role,
    relationStage: stage,
    composedDirective: customDirective,
    emotionPrimary: emotion.state.primary,
    emotionIntensity: emotion.state.intensity,
    emotionTrendSummary: emotion.trendSummary,
    basicFacts: memories.basicFacts,
    lastConversationSummary: memories.lastConversationSummary,
    dynamicMemories: memories.dynamicMemories,
  });
  tPrompt.end();

  // ===== 阶段 3：LLM 回复 =====
  const tLLM = createTimer('LLM首字节');
  const model = getDeepSeekChat();
  const userIdentifier = { userId, platform, platformId };

  let firstChunkLogged = false;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: processedMessages,

    onChunk: () => {
      if (!firstChunkLogged) {
        firstChunkLogged = true;
        tLLM.end();
      }
    },

    // ===== 阶段 4：流结束后自动处理记忆（不依赖外界） =====
    // fire-and-forget：不 await，stream 立即关闭，前端按钮瞬间恢复
    onFinish: ({ text }) => {
      void (async () => {
        try {
          // push 到 Redis unextracted
          await pushUnextractedMessages(
            platform, platformId,
            `用户: ${currentMessageText}`,
            `Snow: ${text}`,
          );

          // 检查是否触发周期性任务（记忆提取 + 关系评估）
          const length = await getUnextractedLength(platform, platformId);
          if (length >= EXTRACT_EVERY_N_MESSAGES) {
            await executePeriodicTasks(userIdentifier);
          }

          // 推延时任务（新的覆盖旧的）
          await scheduleDelayedTask(userIdentifier);
        } catch (err) {
          console.error('[getChatResponse] 异步记忆处理失败:', err);
        }
      })();
    },
  });

  // 返回 streamText 原始结果
  // CLI 用 result.textStream，Web 用 result.toUIMessageStreamResponse()
  return result;
}

/**
 * CLI 退出善后
 *
 * CLI 退出时 setTimeout 的延时任务不会执行，需要手动善后。
 * Web/QQ/微信不需要调用这个函数——延时任务自动兜底。
 */
export async function finalizeSession(platformId: string, platform: string): Promise<void> {
  const identity = await resolveUserIdentity(platform, platformId);
  await cancelDelayedTask(platform, platformId);
  await executeIdleTasks({ userId: identity.userId, platform, platformId });
}
