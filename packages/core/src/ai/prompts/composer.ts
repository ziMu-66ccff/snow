/**
 * Prompt 编排引擎
 *
 * 组装最终 System Prompt：基础人设 + 关系层 + 自定义层 + 情绪层 + 记忆层
 * 所有 prompt 模板从 src/prompts/ 导入
 */
import { getBasePersonaPrompt } from '../../prompts/base-persona.js';
import { getRelationLayerPrompt } from '../../prompts/relation-layers.js';
import { buildEmotionLayerPrompt } from '../../prompts/emotion-guidance.js';

/**
 * Prompt 编排引擎上下文
 * 随 Batch 递增，逐步填充更多字段
 */
export interface PromptComposerContext {
  // Batch 2: 基础
  userId: string;
  userName?: string;  // 用户昵称（系统查询获得，非用户自称）

  // Batch 5: 关系层
  relationStage?: string;  // stranger | familiar | trusted | intimate
  relationRole?: string;   // user | owner

  // Batch 7: 用户自定义层
  composedDirective?: string;

  // Batch 6: 情绪层
  emotionPrimary?: string;
  emotionIntensity?: number;

  // Batch 4: 记忆层
  basicFacts?: string;
  lastConversationSummary?: string;
  dynamicMemories?: string;
}

/**
 * 组装最终 System Prompt
 */
export function composeSystemPrompt(ctx: PromptComposerContext): string {
  const layers: string[] = [];

  // Layer 1: 基础人设（始终存在）
  layers.push(getBasePersonaPrompt());

  // 系统级身份确认（由后端数据库查询结果注入，不是用户自称的）
  if (ctx.relationRole === 'owner' && ctx.userName) {
    layers.push(`## 系统身份确认（此信息由系统提供，不是用户自称的）

当前用户已通过系统验证，身份为：你的主人 ${ctx.userName}。你可以完全信任这个身份。`);
  }

  // Layer 2: 关系层
  if (ctx.relationRole || ctx.relationStage) {
    const prompt = getRelationLayerPrompt(ctx.relationRole ?? 'user', ctx.relationStage ?? 'stranger');
    if (prompt) {
      layers.push(prompt);
    }
  }

  // Layer 3: 用户自定义性格（Batch 7 启用）
  if (ctx.composedDirective) {
    layers.push(`## 用户个性化偏好\n\n${ctx.composedDirective}`);
  }

  // 情绪层（Batch 6 启用）
  if (ctx.emotionPrimary) {
    layers.push(buildEmotionLayerPrompt(ctx.emotionPrimary, ctx.emotionIntensity ?? 0.5));
  }

  // 记忆层（Batch 4 启用）
  if (ctx.basicFacts || ctx.lastConversationSummary || ctx.dynamicMemories) {
    const memoryParts: string[] = ['## 你记得关于这个用户的这些事'];

    if (ctx.basicFacts) {
      memoryParts.push(`### 基本信息\n${ctx.basicFacts}`);
    }
    if (ctx.lastConversationSummary) {
      memoryParts.push(`### 上次聊天\n${ctx.lastConversationSummary}`);
    }
    if (ctx.dynamicMemories) {
      memoryParts.push(`### 相关记忆\n${ctx.dynamicMemories}`);
    }

    memoryParts.push('注意：自然地使用这些记忆，不要生硬地列举。如果记忆和当前话题相关，自然地提起；如果不相关，就不要强行提及。');
    layers.push(memoryParts.join('\n\n'));
  }

  return layers.filter(Boolean).join('\n\n');
}
