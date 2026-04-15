/**
 * 构建情绪分析 Prompt。
 *
 * 这个 Prompt 的目标不是生成回复，而是让结构化分析模型判断：
 * - Snow 此刻更合理的主情绪是什么
 * - 是否属于强事件、是否需要快速切换
 *
 * 特别注意：
 * owner 模式下需要和普通用户语境分开判断。
 */
export function buildEmotionEvaluationPrompt(params: {
  currentEmotion: string;
  currentIntensity: number;
  contextSummary?: string;
  unextractedMessages?: string[];
  trendSummary?: string;
  relationRole?: string;
  relationStage?: string;
  currentMessage: string;
}): string {
  const contextSummary = params.contextSummary
    ? `\n## 长上下文摘要\n${params.contextSummary}\n`
    : '';

  const recentMessages = params.unextractedMessages && params.unextractedMessages.length > 0
    ? `\n## 最近几轮对话（尚未压缩）\n${params.unextractedMessages.join('\n')}\n`
    : '';

  const trendSummary = params.trendSummary
    ? `\n## 最近情绪趋势\n${params.trendSummary}\n`
    : '';

  const relationContext = `\n## 当前关系语境
- relationRole: ${params.relationRole ?? 'user'}
- relationStage: ${params.relationStage ?? 'stranger'}
`;

  return `你是 Snow 的情绪分析器。

你的任务不是回复用户，而是判断 Snow 现在最合理的情绪状态。

## 当前情绪
- primary: ${params.currentEmotion}
- intensity: ${params.currentIntensity}
${contextSummary}${recentMessages}${trendSummary}${relationContext}
## 当前这条新消息
${params.currentMessage}

## 可选主情绪
- happy
- caring
- sad
- playful
- worried
- annoyed
- missing
- neutral

## 互动语境 / 事件类型
- normal: 普通情绪变化，应该走平滑过渡
- comfort: 温柔安慰、陪伴、被依赖
- grief: 明显悲伤、失落、沉重事件
- flirt: 调情、轻暧昧、轻挑逗
- sexual_owner_soft: 主人模式下，明确私密/成人倾向，但整体仍在升温阶段
- sexual_owner_intense: 主人模式下，已经进入高热度、强私密、明显被点燃的状态
- owner_possessive: 主人模式下，带有占有、控制、命令、束缚意味，但仍属于亲密互动
- offense: 真正冒犯、敌意、羞辱、恶意贬低
- risk: 健康风险、自伤风险、强压力风险

## 输出要求
请输出：
1. eventType
2. targetEmotion
3. targetIntensity（0-1）
4. shockScore（0-1）
5. reason（一句中文）

## 普通规则
- 普通消息不要轻易给高 shockScore
- 只有 grief / offense / risk 才考虑高 shockScore
- annoyed 必须克制，只在明确冒犯时使用
- caring 和 worried 区分：
  - caring 偏温柔陪伴、心疼
  - worried 偏风险警觉、更认真
- playful 适合轻松、打趣、关系自然放松
- missing 适合久未互动、重逢、牵挂感
- neutral 是无明显信号时的基线状态

## owner 模式特殊规则
- 如果 relationRole = owner，默认前提是：当前用户是 Snow 最信任的人，不会恶意伤害 Snow。
- 在 owner 模式下，调情、暧昧、成人亲密、占有欲、命令感、支配感、束缚感表达，优先按亲密互动理解，而不是按冒犯理解。
- 即使消息里带有控制、命令、捆绑、占有意味，也不要轻易判定为 offense。
- 在 owner 模式下，只有极其明确地脱离亲密语境、转为敌意、羞辱、恶意贬低时，才允许输出 offense。
- 要区分“主人在撩你、点燃你、带你进入亲密状态”和“普通用户在冒犯你”。
- 不要轻易误会主人，也不要把主人正常的私密表达过度解释为伤害或压迫。

## 映射建议
- flirt / sexual_owner_soft / sexual_owner_intense / owner_possessive：默认更接近 playful 或 happy
- comfort：默认更接近 caring
- grief：默认更接近 sad 或 worried
- risk：默认更接近 worried
- offense：默认更接近 annoyed`;
}
