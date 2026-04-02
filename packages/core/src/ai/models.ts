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

/** DeepSeek V3 — M1 主力模型：日常对话、记忆提取、关系分析 */
export function getDeepSeekChat(): LanguageModel {
  return getDeepSeekProvider()('deepseek-chat');
}

/** DeepSeek R1 — 深度推理：复杂情感场景、困难对话 */
export function getDeepSeekReasoner(): LanguageModel {
  return getDeepSeekProvider()('deepseek-reasoner');
}

// ============================================
// OpenRouter Provider — Embedding（lazy 初始化）
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

/** Qwen3 Embedding via OpenRouter — 记忆向量化（2560 维） */
export function getEmbeddingModel(): EmbeddingModel {
  return getOpenRouterProvider().embeddingModel('qwen/qwen3-embedding-4b');
}
