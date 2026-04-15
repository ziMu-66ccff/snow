import { embed } from 'ai';
import { getEmbeddingModel } from '../ai/models';
import { extractMemories, type MemoryExtraction } from './extractor';
import {
  upsertFactualMemory,
  insertSemanticMemory,
  getFactualMemoriesForUser,
} from '../db/queries/memory-write';

export interface WriteMemoriesInput {
  userId: string;
  /** 需要提取记忆的新对话（未提取过的部分） */
  newMessages: string;
  /** 之前已提取过的对话摘要（仅供上下文理解） */
  contextSummary?: string;
  conversationId?: string;
}

export interface WriteMemoriesResult {
  extraction: MemoryExtraction;
  factsWritten: number;
  factsUpdated: number;
  impressionsWritten: number;
}

/**
 * 记忆写入主流程（增量提取）
 *
 * 1. 查询已有事实（用于冲突检测）
 * 2. LLM 提取记忆（事实 + 印象 + 更新）
 * 3. 写入事实记忆（UPSERT）
 * 4. 处理更新（旧值覆盖 + 生成语义记忆保留历史痕迹）
 * 5. 向量化并写入语义记忆
 */
export async function writeMemories(input: WriteMemoriesInput): Promise<WriteMemoriesResult> {
  const { userId, newMessages, contextSummary, conversationId } = input;

  // 1. 查询已有事实，传给 extractor 做冲突检测
  const existingFacts = await getFactualMemoriesForUser(userId);
  const existingFactsText = existingFacts.length > 0
    ? existingFacts.map(f => `- ${f.category}/${f.key}: ${f.value}`).join('\n')
    : undefined;

  // 2. LLM 提取记忆
  const extraction = await extractMemories(newMessages, contextSummary, existingFactsText);

  let factsWritten = 0;
  let factsUpdated = 0;
  let impressionsWritten = 0;

  // 3. 写入事实记忆
  for (const fact of extraction.facts) {
    const result = await upsertFactualMemory({
      userId,
      category: fact.category,
      key: fact.key,
      value: fact.value,
      importance: fact.importance,
      source: conversationId,
    });
    if (result.action === 'inserted') factsWritten++;
    if (result.action === 'updated') factsUpdated++;
  }

  // 4. 处理更新（更新旧事实 + 生成语义记忆保留历史）
  for (const update of extraction.updates) {
    await upsertFactualMemory({
      userId,
      category: update.category,
      key: update.key,
      value: update.newValue,
      importance: 0.7,
      source: conversationId,
    });
    factsUpdated++;

    const historyContent = `${update.key} 从「${update.oldValue}」变为「${update.newValue}」（${update.reason}）`;
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: historyContent,
    });
    await insertSemanticMemory({
      userId,
      content: historyContent,
      embedding: embedding,
      importance: 0.5,
      emotionalIntensity: 0.2,
      topic: update.category,
    });
    impressionsWritten++;
  }

  // 5. 向量化并写入语义记忆
  for (const impression of extraction.impressions) {
    const { embedding } = await embed({
      model: getEmbeddingModel(),
      value: impression.content,
    });
    await insertSemanticMemory({
      userId,
      content: impression.content,
      embedding: embedding,
      importance: impression.importance,
      emotionalIntensity: impression.emotionalIntensity,
      topic: impression.topic,
    });
    impressionsWritten++;
  }

  return { extraction, factsWritten, factsUpdated, impressionsWritten };
}
