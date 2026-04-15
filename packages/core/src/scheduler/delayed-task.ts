/**
 * 会话结束延时任务管理
 *
 * 业务语义：
 * - 每次收到新消息，都为当前用户安排一个 30 分钟后的“会话结束任务”。
 * - 如果旧任务还未执行，新消息会覆盖旧任务。
 * - 会话结束任务真正落地时，要执行 Snow 的 idle 收尾逻辑。
 *
 * 设计边界：
 * - 调度、覆盖、幂等判断都在 core。
 * - Web 只暴露一个极薄的 HTTP 回调入口。
 * - 为了兼容本地 CLI 调试，未配置 QStash 时保留 setTimeout fallback。
 */
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { Client } from '@upstash/qstash';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type UserIdentifier, executeIdleTasks } from './task-scheduler';
import {
  acquireIdleTaskExecutionLock,
  clearScheduledIdleTask,
  getScheduledIdleTask,
  setScheduledIdleTask,
} from '../db/queries/redis-store';

/** 延时时间：30 分钟（秒） */
const DELAY_SECONDS = 30 * 60;

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
config({ path: envPath });

/** 本地 CLI fallback 的定时器（仅在未配置 QStash 时使用） */
const localTimers = new Map<string, ReturnType<typeof setTimeout>>();

export interface IdleTaskPayload extends UserIdentifier {
  taskId: string;
}

function timerKey(platform: string, platformId: string): string {
  return `${platform}:${platformId}`;
}

function isQStashConfigured(): boolean {
  return Boolean(
    process.env.CORE_QSTASH_TOKEN && process.env.CORE_QSTASH_IDLE_CALLBACK_URL,
  );
}

function getQStashClient(): Client {
  const token = process.env.CORE_QSTASH_TOKEN;
  if (!token) {
    throw new Error('CORE_QSTASH_TOKEN is not set');
  }

  return new Client({ token });
}

function getIdleTaskCallbackUrl(): string {
  const url = process.env.CORE_QSTASH_IDLE_CALLBACK_URL;
  if (!url) {
    throw new Error('CORE_QSTASH_IDLE_CALLBACK_URL is not set');
  }

  return url;
}

function createTaskId(user: UserIdentifier): string {
  return `${user.platform}_${user.platformId}_${randomUUID()}`;
}

/**
 * 本地 fallback：使用进程内 setTimeout 维持和 M1 相同的行为。
 *
 * 这个分支只用于：
 * - CLI 调试；
 * - 未接通 QStash 的本地开发环境。
 *
 * 生产环境应始终走 QStash 分支。
 */
function scheduleLocalFallback(user: UserIdentifier): void {
  const key = timerKey(user.platform, user.platformId);
  const existing = localTimers.get(key);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    localTimers.delete(key);
    try {
      await executeIdleTasks(user);
    } catch (err) {
      console.error(`[delayed-task] 本地延时任务失败 (${key}):`, err);
    }
  }, DELAY_SECONDS * 1000);

  localTimers.set(key, timer);
}

/** 取消本地 fallback 定时器。 */
function cancelLocalFallback(platform: string, platformId: string): void {
  const key = timerKey(platform, platformId);
  const existing = localTimers.get(key);
  if (!existing) return;

  clearTimeout(existing);
  localTimers.delete(key);
}

/**
 * 推送一个新的会话结束任务。
 *
 * 规则：
 * - 同一用户只允许存在一个待执行任务；
 * - 新任务会覆盖旧任务；
 * - 任务信息会写入 Redis，供取消和回调校验使用。
 */
export async function scheduleDelayedTask(user: UserIdentifier): Promise<void> {
  if (!isQStashConfigured()) {
    scheduleLocalFallback(user);
    return;
  }

  const client = getQStashClient();
  const callbackUrl = getIdleTaskCallbackUrl();
  const existing = await getScheduledIdleTask(user.platform, user.platformId);

  // 新消息到来时，旧的“会话结束任务”必须失效。
  if (existing?.messageId) {
    try {
      await client.messages.cancel(existing.messageId);
    } catch (err) {
      console.error('[delayed-task] 取消旧 QStash 任务失败:', err);
    }
  }

  const taskId = createTaskId(user);
  const payload: IdleTaskPayload = { ...user, taskId };
  const response = await client.publishJSON({
    url: callbackUrl,
    delay: DELAY_SECONDS,
    body: payload,
  });

  await setScheduledIdleTask(user.platform, user.platformId, {
    taskId,
    messageId: response.messageId,
    scheduledFor: new Date(Date.now() + DELAY_SECONDS * 1000).toISOString(),
  });
}

/**
 * 取消当前待执行的会话结束任务。
 *
 * 典型使用场景：
 * - CLI 主动结束会话；
 * - 新消息到来前的覆盖逻辑；
 * - 外部显式结束当前会话。
 */
export async function cancelDelayedTask(platform: string, platformId: string): Promise<void> {
  if (!isQStashConfigured()) {
    cancelLocalFallback(platform, platformId);
    return;
  }

  const existing = await getScheduledIdleTask(platform, platformId);
  if (!existing) return;

  try {
    await getQStashClient().messages.cancel(existing.messageId);
  } catch (err) {
    console.error('[delayed-task] 取消 QStash 任务失败:', err);
  }

  await clearScheduledIdleTask(platform, platformId);
}

/**
 * 处理 QStash 的会话结束回调。
 *
 * 这个函数属于 Snow core，而不是 Web：
 * - Web 只负责收 HTTP 请求、验签、把 payload 传进来；
 * - 真正的“这条任务该不该执行”和“执行什么”都在这里判断。
 */
export async function handleDelayedTaskCallback(payload: IdleTaskPayload): Promise<{
  executed: boolean;
  reason?: 'duplicate' | 'stale';
}> {
  const currentTask = await getScheduledIdleTask(payload.platform, payload.platformId);

  // 旧任务即使没取消干净，只要它不是当前最新任务，也不能继续执行。
  if (!currentTask || currentTask.taskId !== payload.taskId) {
    return { executed: false, reason: 'stale' };
  }

  // 即使 QStash 或网络重试，同一个 taskId 也只允许真正执行一次。
  const acquired = await acquireIdleTaskExecutionLock(payload.taskId);
  if (!acquired) {
    return { executed: false, reason: 'duplicate' };
  }

  await clearScheduledIdleTask(payload.platform, payload.platformId);
  await executeIdleTasks(payload);

  return { executed: true };
}
