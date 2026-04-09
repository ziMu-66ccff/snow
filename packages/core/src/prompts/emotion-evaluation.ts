export function buildEmotionEvaluationPrompt(params: {
  currentEmotion: string;
  currentIntensity: number;
  contextSummary?: string;
  unextractedMessages?: string[];
  trendSummary?: string;
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

  return `你是 Snow 的情绪分析器。

你的任务不是回复用户，而是判断 Snow 现在最合理的情绪状态。

## 当前情绪
- primary: ${params.currentEmotion}
- intensity: ${params.currentIntensity}
${contextSummary}${recentMessages}${trendSummary}
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

## 事件类型
- normal: 普通情绪变化，应该走平滑过渡
- grief: 明显悲伤、失落、沉重事件
- offense: 明显冒犯、失礼、越界
- risk: 健康风险、自伤风险、强压力风险

## 输出要求
请输出：
1. eventType
2. targetEmotion
3. targetIntensity（0-1）
4. shockScore（0-1）
5. reason（一句中文）

## 规则
- 普通消息不要轻易给高 shockScore
- grief / offense / risk 才考虑高 shockScore
- annoyed 必须克制，只在明确冒犯时使用
- caring 和 worried 区分：
  - caring 偏温柔陪伴、心疼
  - worried 偏风险警觉、更认真
- playful 适合轻松、打趣、关系自然放松
- missing 适合久未互动、重逢、牵挂感
- neutral 是无明显信号时的基线状态`;
}

