export function buildEmotionTrendSummaryPrompt(params: {
  snapshots: Array<{
    primaryEmotion: string;
    intensity: number;
    trigger: string | null;
    createdAt: Date;
  }>;
}): string {
  const lines = params.snapshots.map((snapshot, index) => {
    const time = snapshot.createdAt.toISOString();
    const trigger = snapshot.trigger ? `，触发原因：${snapshot.trigger}` : '';
    return `${index + 1}. ${time} | ${snapshot.primaryEmotion} | 强度 ${snapshot.intensity}${trigger}`;
  });

  return `你是 Snow 的情绪趋势归纳器。

下面是 Snow 对某个用户最近一段时间的情绪快照。请归纳成 1-2 句简短中文摘要，总长度不要超过 80 个中文字符。

要求：
- 总结最近的主导情绪和延续感
- 不要重新定义当前情绪，只做趋势归纳
- 不要写成流水账
- 语气自然，但必须简洁

情绪快照：
${lines.join('\n')}`;
}

