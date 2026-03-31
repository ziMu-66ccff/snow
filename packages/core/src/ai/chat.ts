import { streamText, type ModelMessage, type LanguageModel } from 'ai';
import { composeSystemPrompt, type PromptComposerContext } from './prompts/composer.js';
import { applySlidingWindow } from './sliding-window.js';

export interface ChatInput {
  userId: string;
  userName?: string;
  message: string;
  history?: ModelMessage[];
  /** 用于对话的语言模型（动态选择：Snow 可根据场景选不同模型） */
  model: LanguageModel;
  relationStage?: string;
  relationRole?: string;
  composedDirective?: string;
  emotionPrimary?: string;
  emotionIntensity?: number;
  basicFacts?: string;
  lastConversationSummary?: string;
  dynamicMemories?: string;
}

export interface ChatResponse {
  textStream: AsyncIterable<string>;
  fullText: PromiseLike<string>;
}

/**
 * 调用 LLM 生成 Snow 的回复（无状态）
 *
 * 组装 Prompt → 滑动窗口裁剪 history → 调用 LLM → 返回流式输出
 * 对话模型从外部注入（未来支持动态路由）
 * 滑动窗口/摘要等内部工具使用固定模型
 */
export async function getChatResponse(input: ChatInput): Promise<ChatResponse> {
  const ctx: PromptComposerContext = {
    userId: input.userId,
    userName: input.userName,
    relationStage: input.relationStage,
    relationRole: input.relationRole,
    composedDirective: input.composedDirective,
    emotionPrimary: input.emotionPrimary,
    emotionIntensity: input.emotionIntensity,
    basicFacts: input.basicFacts,
    lastConversationSummary: input.lastConversationSummary,
    dynamicMemories: input.dynamicMemories,
  };

  const systemPrompt = composeSystemPrompt(ctx);

  // 滑动窗口：对话历史超过 8K token 时，早期对话压缩为摘要
  const trimmedHistory = await applySlidingWindow(input.history ?? []);

  const messages: ModelMessage[] = [
    ...trimmedHistory,
    { role: 'user', content: input.message },
  ];

  const result = streamText({
    model: input.model,
    system: systemPrompt,
    messages,
  });

  return {
    textStream: result.textStream,
    fullText: result.text,
  };
}
