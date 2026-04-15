import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';

// ============================================
// DeepSeek Provider（lazy 初始化）
// ============================================

let _deepseek: ReturnType<typeof createDeepSeek> | null = null;

function getDeepSeekProvider() {
  if (!_deepseek) {
    _deepseek = createDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    });
  }
  return _deepseek;
}

// ============================================
// OpenRouter Provider（lazy 初始化）
// ============================================

let _openrouter: ReturnType<typeof createOpenAI> | null = null;

function getOpenRouterProvider() {
  if (!_openrouter) {
    _openrouter = createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }
  return _openrouter;
}

/** DeepSeek V3.2 — 主对话 + 结构化任务模型 */
export function getDeepSeekChat(): LanguageModel {
  return getDeepSeekProvider()('deepseek-chat');
}

/** DeepSeek Reasoner — 复杂推理备用模型 */
export function getDeepSeekReasoner(): LanguageModel {
  return getDeepSeekProvider()('deepseek-reasoner');
}

/** BAAI bge-m3 via OpenRouter — 记忆向量化（1024 维） */
export function getEmbeddingModel(): EmbeddingModel {
  return getOpenRouterProvider().embeddingModel('baai/bge-m3');
}
