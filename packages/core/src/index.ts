// DB
export * from './db/schema';
export { db, client } from './db/client';
export { redis } from './db/redis';

// Drizzle operators（供外部包查询用，避免直接依赖 drizzle-orm）
export { eq, and, or, desc, asc, sql, inArray } from 'drizzle-orm';

// AI — Models
export { getDeepSeekChat, getDeepSeekReasoner, getEmbeddingModel } from './ai/models';

// AI — Prompt
export { composeSystemPrompt, type PromptComposerContext } from './ai/prompts-composer';

// AI — Message Utils（统一处理 ModelMessage 多类型 content）
export {
  messageToText,
  formatMessage,
  formatMessages,
  isConversationMessage,
  isProtectedMessage,
} from './ai/message-utils';

// AI — Chat（外界只需要这一个函数 + CLI 善后函数）
export { getChatResponse, finalizeSession, type ChatInput } from './ai/chat';

// Memory（内部使用，但也导出供测试和高级用途）
export { extractMemories, type MemoryExtraction } from './memory/extractor';
export { writeMemories, type WriteMemoriesInput, type WriteMemoriesResult } from './memory/writer';
export { retrieveMemories, type RetrievedMemories } from './memory/retriever';
export { memoryVividness } from './memory/vividness';
export { generateConversationSummary } from './memory/summarizer';
export { runMemoryExtraction } from './memory/extract';

// Scheduler
export { executePeriodicTasks, executeIdleTasks } from './scheduler/task-scheduler';
export {
  scheduleDelayedTask,
  cancelDelayedTask,
  handleDelayedTaskCallback,
  type IdleTaskPayload,
} from './scheduler/delayed-task';

// Relation
export { evaluateRelationSignals } from './relation/evaluator';
export { updateRelation } from './relation/updater';
export { gcUserMemories, gcAllMemories } from './memory/gc';

// Emotion
export {
  getEmotionContext,
  updateEmotionState,
  persistEmotionSnapshot,
  refreshEmotionTrendSummary,
  type EmotionType,
  type EmotionState,
} from './emotion/engine';
