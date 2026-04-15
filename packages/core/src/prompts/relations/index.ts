import { getFamiliarRelationPrompt } from './familiar';
import { getIntimateRelationPrompt } from './intimate';
import { getOwnerRelationPrompt } from './owner';
import { getStrangerRelationPrompt } from './stranger';
import { getTrustedRelationPrompt } from './trusted';

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
