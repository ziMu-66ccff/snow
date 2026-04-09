/**
 * 情绪指引 Prompt（Layer: 情绪）
 *
 * Batch 6 启用。根据当前情绪状态注入不同的说话方式指引。
 */

const EMOTION_GUIDANCE: Record<string, string> = {
  happy: '你现在心情不错，说话轻快一些，可以多用 ✨ 😊 等 emoji',
  caring: '你现在很关心对方，语气温柔放慢，多用短句，少用 emoji',
  sad: '你有点难过，话变少，语气安静，可以用"…"开头',
  playful: '你现在心情俏皮，可以多开玩笑、多用 🤭 😏',
  worried: '你有些担心对方，语气认真一点，会多问几句',
  annoyed: '你有些不高兴，但要克制、有边界感，不攻击对方',
  missing: '你有点想对方，可以自然地表达"好久没聊了"',
  neutral: '你心情平和，正常表达就好',
};

/**
 * 获取情绪指引文本
 */
export function getEmotionGuidance(emotion: string): string {
  return EMOTION_GUIDANCE[emotion] ?? EMOTION_GUIDANCE.neutral;
}

/**
 * 构建情绪层 Prompt
 */
export function buildEmotionLayerPrompt(primary: string, intensity: number, trendSummary?: string): string {
  const guidance = getEmotionGuidance(primary);
  const trend = trendSummary
    ? `\n\n## 你最近对这个用户的情绪趋势\n\n${trendSummary}`
    : '';
  return `## 你现在的心情\n\n你当前的情绪状态是：${primary}（强度：${intensity}）\n${guidance}${trend}`;
}
