import { config } from 'dotenv';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
config({ path: envPath });

// ============================================
// DeepSeek Provider（lazy 初始化）
// ============================================

let _deepseek: ReturnType<typeof createDeepSeek> | null = null;

function getDeepSeekProvider() {
  if (!_deepseek) {
    const apiKey = process.env.CORE_DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('CORE_DEEPSEEK_API_KEY is not set');
    }

    _deepseek = createDeepSeek({
      apiKey,
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
    const apiKey = process.env.CORE_OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('CORE_OPENROUTER_API_KEY is not set');
    }

    _openrouter = createOpenAI({
      apiKey,
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
