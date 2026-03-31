import type { ModelMessage, LanguageModel } from 'ai';
import { chat } from '../ai/chat.js';
import { writeMemories, type WriteMemoriesResult } from '../memory/writer.js';
import { retrieveMemories } from '../memory/retriever.js';
import { generateAndSaveConversationSummary, compressContextSummary } from '../memory/summarizer.js';

/** 格式化消息为文本（纯函数） */
function formatMessages(messages: ModelMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '用户' : 'Snow'}: ${m.content}`)
    .join('\n');
}

/** 默认每 N 轮增量提取一次记忆 */
const DEFAULT_EXTRACT_INTERVAL = 5;

/** 默认超时时间：30 分钟没收到新消息 → 触发一次记忆提取 */
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export interface ChatSessionConfig {
  userId: string;
  userName: string;
  chatModel: LanguageModel;
  relationRole: string;
  relationStage: string;
  intimacyScore: number;
  /** 每隔多少轮提取一次记忆，默认 5 */
  extractInterval?: number;
  /** 空闲多久触发一次记忆提取（毫秒），默认 30 分钟 */
  idleTimeoutMs?: number;
}

/**
 * 聊天会话
 *
 * 封装一次会话的完整状态和行为：
 * - 对话历史管理
 * - 记忆检索 + 注入
 * - 增量记忆提取（每 N 轮 + 空闲超时自动触发）
 *
 * 外界只需要调 send()，其余全自动。
 * 所有平台壳（CLI / Web / QQ / 微信）共用这一个类。
 */
export class ChatSession {
  /** 全量对话历史（传给 LLM） */
  private history: ModelMessage[] = [];

  /** 未提取记忆的消息缓冲区（提取后清空，不依赖 history 下标） */
  private unextractedBuffer: ModelMessage[] = [];

  /** 上次提取记忆后的轮次计数 */
  private roundsSinceLastExtract = 0;

  /** 之前已提取部分的摘要（作为下次提取的上下文） */
  private extractedContextSummary = '';

  /** 会话开始时间 */
  private startedAt = new Date();

  /** 空闲超时计时器（超时 → 自动提取记忆 + 生成摘要） */
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly config: Required<ChatSessionConfig>;

  constructor(config: ChatSessionConfig) {
    this.config = {
      ...config,
      extractInterval: config.extractInterval ?? DEFAULT_EXTRACT_INTERVAL,
      idleTimeoutMs: config.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    };
  }

  /**
   * 发送一条消息给 Snow
   *
   * 内部自动完成：
   * 1. 重置空闲计时器
   * 2. 检索记忆
   * 3. 调用 LLM 生成流式回复
   * 4. 消费完流后自动记录 history + buffer
   * 5. 达到 N 轮时自动增量提取记忆
   *
   * 外界只需要消费返回的 textStream，不需要做任何其他事。
   */
  async send(message: string): Promise<{
    textStream: AsyncIterable<string>;
  }> {
    const { userId, userName, chatModel, relationRole, relationStage, intimacyScore } = this.config;

    // 重置空闲计时器
    this.resetIdleTimer();

    // 检索记忆
    const memories = await retrieveMemories(userId, message, { intimacyScore });

    // 调用 LLM
    const result = await chat({
      model: chatModel,
      userId,
      userName,
      message,
      history: this.history,
      relationRole,
      relationStage,
      basicFacts: memories.basicFacts,
      lastConversationSummary: memories.lastConversationSummary,
      dynamicMemories: memories.dynamicMemories,
    });

    // 包装 textStream：消费完毕后自动记录 + 可能触发提取
    const self = this;
    const wrappedStream = (async function* () {
      let fullResponse = '';
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        yield chunk;
      }
      // 流消费完毕，自动记录本轮对话
      await self.recordRound(message, fullResponse);
    })();

    return { textStream: wrappedStream };
  }

  /**
   * 记录一轮完成的对话 + 可能触发增量提取
   * 由 send() 内部自动调用，外界不需要感知
   */
  private async recordRound(userMessage: string, assistantResponse: string): Promise<void> {
    const userMsg: ModelMessage = { role: 'user', content: userMessage };
    const assistantMsg: ModelMessage = { role: 'assistant', content: assistantResponse };

    this.history.push(userMsg, assistantMsg);
    this.unextractedBuffer.push(userMsg, assistantMsg);
    this.roundsSinceLastExtract++;

    // 达到 N 轮时增量提取记忆
    if (this.roundsSinceLastExtract >= this.config.extractInterval) {
      await this.extractMemories();
    }
  }

  /**
   * 增量提取记忆 + 生成摘要
   * 两种触发方式：
   * 1. 每 N 轮自动触发（recordRound 里）
   * 2. 空闲超时自动触发（idleTimer）
   */
  private async extractMemories(): Promise<WriteMemoriesResult | null> {
    if (this.unextractedBuffer.length === 0) return null;

    const newMessagesText = formatMessages(this.unextractedBuffer);

    const result = await writeMemories({
      userId: this.config.userId,
      newMessages: newMessagesText,
      contextSummary: this.extractedContextSummary || undefined,
    });

    // 更新上下文摘要
    this.extractedContextSummary = await compressContextSummary(
      this.extractedContextSummary,
      newMessagesText,
    );

    // 清空缓冲区
    this.unextractedBuffer.length = 0;
    this.roundsSinceLastExtract = 0;

    return result;
  }

  /**
   * 空闲超时处理
   * 超时不是"会话结束"，只是"好久没消息了，把 buffer 里的记忆先存了"
   */
  private async onIdleTimeout(): Promise<void> {
    if (this.unextractedBuffer.length > 0) {
      await this.extractMemories();
    }
    // 同时生成一次对话摘要，记录到目前为止的对话
    if (this.history.length > 0) {
      try {
        await generateAndSaveConversationSummary({
          userId: this.config.userId,
          conversationMessages: this.extractedContextSummary || formatMessages(this.history),
          startedAt: this.startedAt,
        });
      } catch {
        // 摘要保存失败不影响主流程
      }
      // 重置开始时间，下次摘要从这里算
      this.startedAt = new Date();
    }
  }

  /** 重置空闲计时器（每次收到消息时调用） */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.onIdleTimeout();
    }, this.config.idleTimeoutMs);
  }

  /**
   * 外界主动通知善后（如 CLI 退出前）
   * 不是"关闭会话"，是"我要走了，你把剩下的记忆存一下"
   */
  async flush(): Promise<string | null> {
    // 停止空闲计时器
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.history.length === 0) return null;

    // 保存 buffer 快照（extractMemories 会清空 buffer）
    const remainingText = formatMessages(this.unextractedBuffer);

    // 提取剩余记忆
    if (this.unextractedBuffer.length > 0) {
      await this.extractMemories();
    }

    // 生成对话摘要
    const conversationForSummary = this.extractedContextSummary
      ? `[之前的对话的摘要]\n${this.extractedContextSummary}\n\n[最近的对话]\n${remainingText}`
      : remainingText;

    const summary = await generateAndSaveConversationSummary({
      userId: this.config.userId,
      conversationMessages: conversationForSummary,
      startedAt: this.startedAt,
    });

    return summary;
  }

  /** 获取当前对话轮次数 */
  get rounds(): number {
    return Math.floor(this.history.length / 2);
  }
}
