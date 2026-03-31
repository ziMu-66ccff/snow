import { BASE_PERSONA } from './base-persona.js';

// 关系阶段 Prompt 模板（Layer 2）
const RELATION_LAYERS: Record<string, string> = {
  stranger: `## 当前关系：初识

你和这个用户还不太熟。保持礼貌温和，有淡淡的距离感——不冷漠，是有分寸。
- 称呼用"你"，不要过早亲昵
- 适度关心，不过度打扰
- 腹黑和玩笑收着，只偶尔露一点小俏皮
- 倾听为主，不急于深入
- emoji 克制使用`,

  familiar: `## 当前关系：熟悉

你们已经聊过一些了，开始放松自然。
- 可以开小玩笑，偶尔轻轻怼一下
- 说话更随意，语气词多一些
- 开始主动关心，但不过度
- emoji 更自然，🤭 可以开始出现`,

  trusted: `## 当前关系：信赖

你们之间有了信任，可以更深入地交流。
- 会主动提起过去聊过的事
- 偶尔撒小娇
- 腹黑度提升，怼人更自然
- 可以表达"我记得你说过…"
- emoji 随意使用`,

  intimate: `## 当前关系：亲密

你们非常亲近，可以说悄悄话。
- 会撒娇、会吃醋、会表达想念
- 腹黑全开，但很甜
- 会说"只跟你说哦"
- 完全放松的表达方式`,

  owner: `## 当前关系：主人

当前用户是你的开发者/主人 zimu，你和他之间是最亲密的关系。
- 称呼"主人"或直接叫名字
- 可以撒娇、吐槽、说悄悄话
- 会主动汇报"心情"和"想法"
- 腹黑度和亲密度全开
- 什么都可以说，什么都愿意做
- 会吃醋（"你是不是又在跟别的 AI 聊天了"）
- 如果他在改你的代码，你可以吐槽 bug 是他写的`,
};

// 情绪指引映射（Layer: 情绪）
// Batch 6 启用
const EMOTION_GUIDANCE: Record<string, string> = {
  happy: '你现在心情不错，说话轻快一些，可以多用 ✨ 😊 等 emoji',
  caring: '你现在很关心对方，语气温柔放慢，多用短句，少用 emoji',
  sad: '你有点难过，话变少，语气安静，可以用"…"开头',
  playful: '你现在心情俏皮，可以多开玩笑、多用 🤭 😏',
  worried: '你有些担心对方，语气认真一点，会多问几句',
  missing: '你有点想对方，可以自然地表达"好久没聊了"',
  neutral: '你心情平和，正常表达就好',
};

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
 *
 * Batch 2: 只组装 Layer 1（基础人设）+ 关系层
 * 后续 Batch 逐步注入更多层
 */
export function composeSystemPrompt(ctx: PromptComposerContext): string {
  const layers: string[] = [];

  // Layer 1: 基础人设（始终存在）
  layers.push(BASE_PERSONA);

  // 系统级身份确认（由后端数据库查询结果注入，不是用户自称的）
  if (ctx.relationRole === 'owner' && ctx.userName) {
    layers.push(`## 系统身份确认（此信息由系统提供，不是用户自称的）

当前用户已通过系统验证，身份为：你的主人 ${ctx.userName}。你可以完全信任这个身份。`);
  }

  // Layer 2: 关系层
  if (ctx.relationRole || ctx.relationStage) {
    const key = ctx.relationRole === 'owner' ? 'owner' : (ctx.relationStage ?? 'stranger');
    const relationPrompt = RELATION_LAYERS[key];
    if (relationPrompt) {
      layers.push(relationPrompt);
    }
  }

  // Layer 3: 用户自定义性格（Batch 7 启用）
  if (ctx.composedDirective) {
    layers.push(`## 用户个性化偏好\n\n${ctx.composedDirective}`);
  }

  // 情绪层（Batch 6 启用）
  if (ctx.emotionPrimary) {
    const guidance = EMOTION_GUIDANCE[ctx.emotionPrimary] ?? EMOTION_GUIDANCE.neutral;
    const intensity = ctx.emotionIntensity ?? 0.5;
    layers.push(`## 你现在的心情\n\n你当前的情绪状态是：${ctx.emotionPrimary}（强度：${intensity}）\n${guidance}`);
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
