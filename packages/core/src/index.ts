// DB
export * from './db/schema.js';
export { db, client } from './db/client.js';
export { redis } from './db/redis.js';

// AI — Models
export { getDeepSeekChat, getDeepSeekReasoner, getEmbeddingModel } from './ai/models.js';

// AI — Prompt
export { composeSystemPrompt, type PromptComposerContext } from './ai/prompts/composer.js';

// AI — Message Utils（统一处理 ModelMessage 多类型 content）
export {
  messageToText,
  formatMessage,
  formatMessages,
  isConversationMessage,
  isProtectedMessage,
} from './ai/message-utils.js';

// AI — Chat（外界只需要这一个函数 + CLI 善后函数）
export { getChatResponse, finalizeSession, type ChatInput } from './ai/chat.js';

// Memory（内部使用，但也导出供测试和高级用途）
export { extractMemories, type MemoryExtraction } from './memory/extractor.js';
export { writeMemories, type WriteMemoriesInput, type WriteMemoriesResult } from './memory/writer.js';
export { retrieveMemories, type RetrievedMemories } from './memory/retriever.js';
export { memoryVividness } from './memory/vividness.js';
export { generateConversationSummary } from './memory/summarizer.js';
export { extractMemories as runMemoryExtraction } from './memory/extract.js';

// Scheduler
export { executePeriodicTasks, executeIdleTasks } from './scheduler/task-scheduler.js';

// Relation
export { evaluateRelationSignals } from './relation/evaluator.js';
export { updateRelation } from './relation/updater.js';
export { gcUserMemories, gcAllMemories } from './memory/gc.js';
