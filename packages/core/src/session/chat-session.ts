import type { ModelMessage, LanguageModel } from 'ai';
import { chat, type ChatResult } from '../ai/chat.js';
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

/** 每 N 轮增量提取一次记忆 */
const DEFAULT_EXTRACT_INTERVAL = 5;

export interface ChatSessionConfig {
  userId: string;
  userName: string;
  chatModel: LanguageModel;
  relationRole: string;
  relationStage: string;
  intimacyScore: number;
  /** 每隔多少轮提取一次记忆，默认 5 */
  extractInterval?: number;
}

export interface OnMessageResult {
  /** Snow 的流式回复 */
  stream: ChatResult;
  /** 本轮是否触发了增量记忆提取 */
  extracted: boolean;
}

/**
 * 聊天会话
 *
 * 封装一次会话的完整状态和行为：
 * - 对话历史管理
 * - 记忆检索 + 注入
 * - 增量记忆提取
 * - 会话结束（兜底提取 + 摘要生成）
 *
 * 所有平台壳（CLI / Web / QQ / 微信）共用这一个类
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

  /** 是否已关闭（防止重复关闭） */
  private closed = false;

  private readonly config: Required<ChatSessionConfig>;

  constructor(config: ChatSessionConfig) {
    this.config = {
      ...config,
      extractInterval: config.extractInterval ?? DEFAULT_EXTRACT_INTERVAL,
    };
  }

  /**
   * 处理一条用户消息
   *
   * 1. 检索记忆
   * 2. 组装 Prompt + 调用 LLM
   * 3. 记录到 history 和 buffer
   * 4. 达到 N 轮时增量提取记忆
   *
   * 返回流式回复，调用方负责消费 stream 并回传 fullText
   */
  async onMessage(message: string): Promise<ChatResult> {
    const { userId, userName, chatModel, relationRole, relationStage, intimacyScore } = this.config;

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

    return result;
  }

  /**
   * 记录一轮完成的对话（用户消息 + Snow 回复）
   * 调用方在消费完 stream 拿到 fullText 后调用
   */
  async recordRound(userMessage: string, assistantResponse: string): Promise<WriteMemoriesResult | null> {
    const userMsg: ModelMessage = { role: 'user', content: userMessage };
    const assistantMsg: ModelMessage = { role: 'assistant', content: assistantResponse };

    // 维护对话历史 + 未提取缓冲区
    this.history.push(userMsg, assistantMsg);
    this.unextractedBuffer.push(userMsg, assistantMsg);
    this.roundsSinceLastExtract++;

    // 达到 N 轮时增量提取记忆
    if (this.roundsSinceLastExtract >= this.config.extractInterval) {
      return this.extractMemories();
    }

    return null;
  }

  /**
   * 增量提取记忆（从 buffer 中取 → 写 DB → 清空 buffer → 更新上下文摘要）
   */
  async extractMemories(): Promise<WriteMemoriesResult | null> {
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
   * 关闭会话（提取剩余记忆 + 生成对话摘要）
   * 有锁保护，重复调用安全
   */
  async close(): Promise<string | null> {
    if (this.closed) return null;
    this.closed = true;
    if (this.history.length === 0) return null;

    // 先保存未提取消息的快照（因为 extractMemories 会清空 buffer）
    const remainingText = formatMessages(this.unextractedBuffer);

    // 兜底提取剩余记忆
    if (this.unextractedBuffer.length > 0) {
      await this.extractMemories();
    }

    // 生成对话摘要
    // 用"已提取部分的压缩摘要 + 最后未提取的原文"，不用全量 history（token 可控）
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

  /** 会话是否已关闭 */
  get isClosed(): boolean {
    return this.closed;
  }
}
