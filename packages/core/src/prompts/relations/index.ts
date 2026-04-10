import { getFamiliarRelationPrompt } from './familiar.js';
import { getIntimateRelationPrompt } from './intimate.js';
import { getOwnerRelationPrompt } from './owner.js';
import { getStrangerRelationPrompt } from './stranger.js';
import { getTrustedRelationPrompt } from './trusted.js';

/**
 * 根据关系角色和阶段，选择当前应注入的关系层 Prompt。
 */
export function getRelationPromptByStage(role: string, stage: string): string | undefined {
  if (role === 'owner') return getOwnerRelationPrompt();

  switch (stage) {
    case 'stranger':
      return getStrangerRelationPrompt();
    case 'familiar':
      return getFamiliarRelationPrompt();
    case 'trusted':
      return getTrustedRelationPrompt();
    case 'intimate':
      return getIntimateRelationPrompt();
    default:
      return getStrangerRelationPrompt();
  }
}
