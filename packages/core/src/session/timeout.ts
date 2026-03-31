/**
 * 会话超时管理器
 *
 * 用户超过指定时间没说话 → 触发回调（提取记忆 + 生成摘要）
 * 每次用户发消息时重置计时器
 *
 * 适用于所有平台（CLI / Web / QQ / 微信）
 */

/** 默认超时时间：30 分钟 */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export interface SessionTimeoutOptions {
  /** 超时时间（毫秒），默认 30 分钟 */
  timeoutMs?: number;
  /** 超时时触发的回调 */
  onTimeout: () => void | Promise<void>;
}

export class SessionTimeoutManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeoutMs: number;
  private readonly onTimeout: () => void | Promise<void>;

  constructor(options: SessionTimeoutOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onTimeout = options.onTimeout;
  }

  /** 用户发了消息，重置计时器 */
  reset() {
    this.clear();
    this.timer = setTimeout(async () => {
      await this.onTimeout();
    }, this.timeoutMs);
  }

  /** 清除计时器（会话显式结束时调用） */
  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
