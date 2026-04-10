import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  real,
  integer,
  jsonb,
  uniqueIndex,
  index,
  vector,
} from 'drizzle-orm/pg-core';

// ============================================
// 用户表
// ============================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: varchar('platform_id', { length: 256 }).notNull(),
  platform: varchar('platform', { length: 64 }).notNull(),
  name: varchar('name', { length: 256 }),
  settings: jsonb('settings'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_users_platform').on(table.platformId, table.platform),
]);

// ============================================
// 关系模型表（多维评估）
// ============================================
export const userRelations = pgTable('user_relations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  role: varchar('role', { length: 32 }).default('user').notNull(),
  stage: varchar('stage', { length: 32 }).default('stranger').notNull(),
  intimacyScore: integer('intimacy_score').default(0).notNull(),
  signalInteractionFreq: real('signal_interaction_freq').default(0).notNull(),
  signalConversationDepth: real('signal_conversation_depth').default(0).notNull(),
  signalEmotionalIntensity: real('signal_emotional_intensity').default(0).notNull(),
  signalTrustLevel: real('signal_trust_level').default(0).notNull(),
  signalTimespan: real('signal_timespan').default(0).notNull(),
  interactionCount: integer('interaction_count').default(0).notNull(),
  lastInteraction: timestamp('last_interaction'),
  topics: text('topics').array(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// 事实记忆表（结构化 key-value）
// ============================================
export const factualMemories = pgTable('factual_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  key: varchar('key', { length: 256 }).notNull(),
  value: text('value').notNull(),
  importance: real('importance').default(0.5).notNull(),
  source: varchar('source', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_factual_user_cat_key').on(table.userId, table.category, table.key),
  index('idx_factual_user').on(table.userId),
]);

// ============================================
// 语义记忆表（向量化，参与语义搜索）
// ============================================
export const semanticMemories = pgTable('semantic_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1024 }),
  importance: real('importance').default(0.5).notNull(),
  emotionalIntensity: real('emotional_intensity').default(0).notNull(),
  topic: varchar('topic', { length: 128 }),
  accessCount: integer('access_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_semantic_user').on(table.userId),
]);

// ============================================
// 对话摘要表（由延时任务持久化 Redis context_summary）
// ============================================
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  platform: varchar('platform', { length: 64 }).notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_conversations_user').on(table.userId),
]);

// ============================================
// 情绪状态历史表
// ============================================
export const emotionStates = pgTable('emotion_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  primaryEmotion: varchar('primary_emotion', { length: 32 }).notNull(),
  secondaryEmotion: varchar('secondary_emotion', { length: 32 }),
  intensity: real('intensity').notNull(),
  trigger: varchar('trigger', { length: 256 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_emotion_user_time').on(table.userId, table.createdAt),
]);

// ============================================
// 情绪趋势摘要表（冷数据）
// ============================================
export const emotionTrends = pgTable('emotion_trends', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull().unique(),
  summary: text('summary').notNull(),
  dominantEmotion: varchar('dominant_emotion', { length: 32 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_emotion_trends_user').on(table.userId),
]);
