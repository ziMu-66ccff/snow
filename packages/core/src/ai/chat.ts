/**
 * Snow 核心对话函数
 *
 * 外界只需要调这一个函数，传入 platformId + platform + messages。
 * 内部自动完成：用户身份查询、记忆检索、滑动窗口、LLM 回复、异步记忆提取。
 *
 * 对齐 Vercel AI SDK useChat 标准：messages 包含完整对话历史（含当前消息）。
 */
import { streamText, type ModelMessage } from 'ai';
import { eq, and } from 'drizzle-orm';
import { getDeepSeekChat } from './models.js';
import { composeSystemPrompt } from './prompts/composer.js';
import { applySlidingWindow } from './sliding-window.js';
import { retrieveMemories } from '../memory/retriever.js';
import { executeMemoryExtraction, executeDelayedExtraction } from '../memory/extract-task.js';
import { scheduleDelayedExtraction, cancelDelayedExtraction } from '../memory/delayed-task.js';
import { db } from '../db/client.js';
import { users, userRelations } from '../db/schema.js';
import {
  getCachedUserIdentity,
  setCachedUserIdentity,
  pushUnextractedMessages,
  getUnextractedLength,
  getMemoryContextSummary,
  type CachedUserIdentity,
} from '../db/queries/redis-store.js';
import { getLastConversationSummary } from '../db/queries/memory-read.js';

/** 每 N 轮增量提取一次记忆 */
const EXTRACT_EVERY_N_MESSAGES = 10; // 5 轮 = 10 条消息

export interface ChatInput {
  platformId: string;
  platform: string;
  /** 完整对话历史（含当前消息，对齐 AI SDK useChat 标准） */
  messages: ModelMessage[];
}

export interface ChatResponse {
  textStream: AsyncIterable<string>;
}

/**
 * 查询用户身份（Redis 缓存 → PG 查询）
 */
async function resolveUserIdentity(platform: string, platformId: string): Promise<CachedUserIdentity> {
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
      .values({ platformId, platform, name: platformId })
      .returning();

    await db.insert(userRelations)
      .values({ userId: newUser.id, role: 'user', stage: 'stranger', intimacyScore: 0 });

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

  const identity: CachedUserIdentity = {
    userId: user.id,
    userName: user.name ?? platformId,
    role: relation?.role ?? 'user',
    stage: relation?.stage ?? 'stranger',
    intimacyScore: relation?.intimacyScore ?? 0,
  };

  // 缓存到 Redis
  await setCachedUserIdentity(platform, platformId, identity);
  return identity;
}

/**
 * 获取上次会话上下文（新会话时注入 Prompt）
 *
 * 优先级：
 * 1. Redis 热数据（context_summary + unextracted 消息）
 * 2. PG 冷数据（conversations 表的摘要）
 * 3. 都没有 = 新用户
 */
async function getLastSessionContext(userId: string): Promise<string | undefined> {
  // 优先 Redis
  const summary = await getMemoryContextSummary(userId);
  if (summary) return summary;

  // 其次 PG
  const lastConvo = await getLastConversationSummary(userId);
  return lastConvo?.summary ?? undefined;
}

/**
 * Snow 核心对话函数
 *
 * 外界只需要传 platformId + platform + messages，其余全自动。
 */
export async function getChatResponse(input: ChatInput): Promise<ChatResponse> {
  const { platformId, platform, messages } = input;

  // ===== 阶段 1：用户身份 =====
  const identity = await resolveUserIdentity(platform, platformId);
  const { userId, userName, role, stage, intimacyScore } = identity;

  // ===== 阶段 2：上下文准备 =====

  // 判断新会话：messages 只有 1 条（当前用户消息）
  const isNewSession = messages.length === 1;
  const lastSessionContext = isNewSession
    ? await getLastSessionContext(userId)
    : undefined;

  // 滑动窗口处理（基于 Redis）
  const processedMessages = await applySlidingWindow(userId, messages);

  // 检索记忆
  const currentMessage = messages[messages.length - 1];
  const currentMessageText = typeof currentMessage.content === 'string'
    ? currentMessage.content
    : JSON.stringify(currentMessage.content);

  const memories = await retrieveMemories(userId, currentMessageText, { intimacyScore });

  // 组装 Prompt
  const systemPrompt = composeSystemPrompt({
    userId,
    userName,
    relationRole: role,
    relationStage: stage,
    basicFacts: memories.basicFacts,
    lastConversationSummary: lastSessionContext ?? memories.lastConversationSummary,
    dynamicMemories: memories.dynamicMemories,
  });

  // ===== 阶段 3：LLM 回复 =====
  const model = getDeepSeekChat(); // 未来支持动态路由

  const result = streamText({
    model,
    system: systemPrompt,
    messages: processedMessages,
  });

  // ===== 阶段 4：包装 stream，流结束后异步处理记忆 =====
  const self = { userId };
  const wrappedStream = (async function* () {
    let fullResponse = '';
    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      yield chunk;
    }

    // 流消费完毕，异步处理记忆（不阻塞）
    setImmediate(async () => {
      try {
        // push 到 Redis unextracted
        await pushUnextractedMessages(
          self.userId,
          `用户: ${currentMessageText}`,
          `Snow: ${fullResponse}`,
        );

        // 检查是否触发轮次提取
        const length = await getUnextractedLength(self.userId);
        if (length >= EXTRACT_EVERY_N_MESSAGES) {
          await executeMemoryExtraction(self.userId);
        }

        // 推延时任务（新的覆盖旧的）
        scheduleDelayedExtraction(self.userId);
      } catch (err) {
        console.error('[getChatResponse] 异步记忆处理失败:', err);
      }
    });
  })();

  return { textStream: wrappedStream };
}

/**
 * CLI 退出善后
 *
 * CLI 退出时 setTimeout 的延时任务不会执行，需要手动善后。
 * Web/QQ/微信不需要调用这个函数——延时任务自动兜底。
 */
export async function finalizeSession(platformId: string, platform: string): Promise<void> {
  const identity = await resolveUserIdentity(platform, platformId);
  cancelDelayedExtraction(identity.userId);
  await executeDelayedExtraction(identity.userId);
}
