// DB
export * from './db/schema.js';
export { db, client } from './db/client.js';
export { redis } from './db/redis.js';

// AI — Models
export { getDeepSeekChat, getDeepSeekReasoner, getEmbeddingModel } from './ai/models.js';

// AI — Prompt
export { composeSystemPrompt, type PromptComposerContext } from './ai/prompts/composer.js';

// AI — Sliding Window
export { applySlidingWindow } from './ai/sliding-window.js';

// AI — Chat（对话模型从外部注入）
export { chat, type ChatInput, type ChatResult } from './ai/chat.js';

// Memory（内部固定模型，调用方不需要关心）
export { extractMemories, type MemoryExtraction } from './memory/extractor.js';
export { writeMemories, type WriteMemoriesInput, type WriteMemoriesResult } from './memory/writer.js';
export { retrieveMemories, type RetrievedMemories } from './memory/retriever.js';
export { memoryVividness } from './memory/vividness.js';
export { generateSummary, generateAndSaveConversationSummary, compressContextSummary } from './memory/summarizer.js';

// Session
export { SessionTimeoutManager, type SessionTimeoutOptions } from './session/timeout.js';
