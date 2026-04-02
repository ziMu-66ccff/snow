/**
 * 对话摘要 Prompt
 *
 * 两种场景：
 * - 首次总结：只有新对话
 * - 增量合并：旧摘要 + 新对话 → 新摘要
 */

/**
 * 构建首次摘要 prompt（没有旧摘要）
 */
export function buildFirstSummaryPrompt(content: string, maxLength: number): string {
  return `你是 Snow 的记忆助手。Snow 是一个 AI 情感陪伴助手，"用户"是和她聊天的人。

请概括以下对话的要点。这个摘要会在下次对话时提供给 Snow，帮助她回忆"上次我们聊了什么"。

要求：
- 用第三人称叙述（"用户xxx，Snow xxx"），自然连贯
- 不要用列表格式，写成一段流畅的叙述
- 保留关键信息：提到的人名、地点、事件、关系、偏好
- 保留情感基调：用户的情绪变化、Snow 的态度
- 去掉无意义的寒暄和重复内容
- 大约 ${maxLength} 字左右，可以适当灵活

对话内容：
${content}`;
}

/**
 * 构建增量合并摘要 prompt（有旧摘要 + 新对话）
 */
export function buildMergeSummaryPrompt(
  content: string,
  existingSummary: string,
  maxLength: number,
): string {
  return `你是 Snow 的记忆助手。Snow 是一个 AI 情感陪伴助手，"用户"是和她聊天的人。

请将旧摘要和新对话合并为一段新的摘要。这个摘要会在下次对话时提供给 Snow，帮助她回忆之前聊了什么。

要求：
- 保留旧摘要中的关键信息（**不能丢弃**——旧信息也是重要的上下文）
- 融入新对话中的新信息
- 用第三人称叙述（"用户xxx，Snow xxx"），自然连贯
- 不要用列表格式，写成一段流畅的叙述
- 保留情感基调和情绪变化
- 去掉重复和无关紧要的内容
- 如果旧摘要和新对话有矛盾，以新对话为准
- 大约 ${maxLength} 字左右，可以适当灵活

[旧摘要]
${existingSummary}

[新对话]
${content}`;
}
