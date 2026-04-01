/**
 * 延时任务管理
 *
 * 每次 getChatResponse 被调用时推一个 30 分钟延时任务。
 * 新的覆盖旧的（同一用户只有一个待执行的延时任务）。
 *
 * M1 实现：setTimeout（CLI 进程常驻）
 * M2 替换：Upstash QStash（Serverless HTTP 回调）
 */
import { executeDelayedExtraction, type UserIdentifier } from './extract-task.js';

/** 延时时间：30 分钟 */
const DELAY_MS = 30 * 60 * 1000;

/** 每个用户的延时任务 timer（key = platform:platformId） */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function timerKey(platform: string, platformId: string): string {
  return `${platform}:${platformId}`;
}

/**
 * 推一个延时任务（新的覆盖旧的）
 *
 * 30 分钟后执行：提取剩余记忆 + 持久化摘要到 PG
 */
export function scheduleDelayedExtraction(user: UserIdentifier): void {
  const key = timerKey(user.platform, user.platformId);

  // 取消旧的
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);

  // 推新的
  const timer = setTimeout(async () => {
    timers.delete(key);
    try {
      await executeDelayedExtraction(user);
    } catch (err) {
      console.error(`[delayed-task] 延时提取失败 (${key}):`, err);
    }
  }, DELAY_MS);

  timers.set(key, timer);
}

/**
 * 取消延时任务（CLI 退出善后时调用）
 */
export function cancelDelayedExtraction(platform: string, platformId: string): void {
  const key = timerKey(platform, platformId);
  const existing = timers.get(key);
  if (existing) {
    clearTimeout(existing);
    timers.delete(key);
  }
}
