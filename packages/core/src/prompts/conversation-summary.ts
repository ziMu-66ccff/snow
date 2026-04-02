/**
 * 对话摘要 Prompt
 *
 * 用于生成/更新对话摘要，两种场景自动适配：
 * - 有旧摘要 → 合并旧摘要 + 新对话
 * - 无旧摘要 → 直接概括新对话
 */

/**
 * 构建摘要生成 prompt
 *
 * @param content - 需要总结的对话文本
 * @param maxLength - 摘要目标字数
 * @param existingSummary - 已有的旧摘要（有则合并，无则首次总结）
 */
export function buildConversationSummaryPrompt(
  content: string,
  maxLength: number,
  existingSummary?: string,
): string {
  const base = `你是 Snow 的记忆助手。Snow 是一个 AI 情感陪伴助手，"用户"是和她聊天的人。

这个摘要会在下次对话时提供给 Snow，帮助她回忆"上次我们聊了什么"。

要求：
- 用第三人称叙述（"用户xxx，Snow xxx"），自然连贯
- 不要用列表格式，写成一段流畅的叙述
- 保留关键信息：提到的人名、地点、事件、关系、偏好
- 保留情感基调：用户的情绪变化、Snow 的态度
- 去掉无意义的寒暄和重复内容
- 大约 ${maxLength} 字左右，可以适当灵活`;

  if (existingSummary) {
    return `${base}
- 保留旧摘要中的关键信息（**不能丢弃**——旧信息也是重要的上下文）
- 融入新对话中的新信息
- 如果旧摘要和新对话有矛盾，以新对话为准

[旧摘要]
${existingSummary}

[新对话]
${content}`;
  }

  return `${base}

对话内容：
${content}`;
}
