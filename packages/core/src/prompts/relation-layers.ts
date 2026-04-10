/**
 * Layer 2 — 关系层 Prompt 分发器
 *
 * 关系层已按阶段拆成独立文件，便于细化和长期维护。
 */
import { getRelationPromptByStage } from './relations/index.js';

/**
 * 获取当前关系阶段对应的 Prompt。
 */
export function getRelationLayerPrompt(role: string, stage: string): string | undefined {
  return getRelationPromptByStage(role, stage);
}
