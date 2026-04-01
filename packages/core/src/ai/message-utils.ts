/**
 * ModelMessage 处理工具函数
 *
 * AI SDK 6.x 的 ModelMessage 类型体系：
 * - SystemModelMessage:    role='system',    content: string
 * - UserModelMessage:      role='user',      content: string | Array<TextPart | ImagePart | FilePart>
 * - AssistantModelMessage: role='assistant',  content: string | Array<TextPart | FilePart | ReasoningPart | ToolCallPart>
 * - ToolModelMessage:      role='tool',       content: Array<ToolResultPart>
 *
 * 本模块提供统一的消息处理工具，所有涉及 message 内容提取的地方都应使用这些函数，
 * 而非直接访问 m.content。
 */
import type { ModelMessage } from 'ai';

/**
 * 从 message content 中提取可读文本
 *
 * 不同 part 类型的处理策略：
 * - TextPart:       提取 text（核心文本内容）
 * - ReasoningPart:  提取 text（推理内容，有价值）
 * - ImagePart:      [图片] 占位 — TODO: 后续支持图片理解时详细处理
 * - FilePart:       [文件] 占位 — TODO: 后续支持文件处理时详细处理
 * - ToolCallPart:   简要描述 — TODO: 后续 MCP/tool 调用时详细处理
 * - ToolResultPart: 简要描述 — TODO: 后续 MCP/tool 调用时详细处理
 * - 未知类型:       忽略
 */
function contentToText(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part: Record<string, any>) => {
        switch (part.type) {
          case 'text':
            return part.text ?? '';
          case 'reasoning':
            return part.text ?? '';
          // TODO: 后续支持图片理解时，提取图片描述或 alt text
          case 'image':
            return '[图片]';
          // TODO: 后续支持文件处理时，提取文件摘要
          case 'file':
            return `[文件${part.filename ? ': ' + part.filename : ''}]`;
          // TODO: 后续 MCP/tool 调用时，记录调用参数摘要
          case 'tool-call':
            return `[调用工具: ${part.toolName ?? 'unknown'}]`;
          // TODO: 后续 MCP/tool 调用时，记录关键返回内容
          case 'tool-result':
            return `[工具 ${part.toolName ?? 'unknown'} 返回了结果]`;
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join(' ');
  }

  // 兜底：不应该走到这里，但防御性处理
  return String(content ?? '');
}

/**
 * 从单条 ModelMessage 提取可读文本
 */
export function messageToText(m: ModelMessage): string {
  return contentToText(m.content);
}

/**
 * 格式化单条消息为带角色前缀的文本
 * 用于摘要生成、记忆提取等需要文本表示的场景
 */
export function formatMessage(m: ModelMessage): string {
  const text = messageToText(m);
  switch (m.role) {
    case 'user':
      return `用户: ${text}`;
    case 'assistant':
      return `Snow: ${text}`;
    case 'system':
      return `[系统] ${text}`;
    case 'tool':
      return `[工具] ${text}`;
    default:
      return text;
  }
}

/**
 * 批量格式化消息为文本
 * @param messages - 消息数组
 * @param rolesFilter - 只包含指定角色的消息，不传则包含全部
 */
export function formatMessages(
  messages: ModelMessage[],
  rolesFilter?: Array<ModelMessage['role']>,
): string {
  const filtered = rolesFilter
    ? messages.filter(m => rolesFilter.includes(m.role))
    : messages;

  return filtered
    .map(formatMessage)
    .join('\n');
}

/**
 * 判断消息是否是对话消息（user 或 assistant）
 * 用于滑动窗口等场景区分"可压缩的对话"和"需保护的控制消息"
 */
export function isConversationMessage(m: ModelMessage): boolean {
  return m.role === 'user' || m.role === 'assistant';
}

/**
 * 判断消息是否是需要保护的控制消息（system 或 tool）
 * 滑动窗口不压缩这些消息：
 * - system: 重要、数量少、token 少
 * - tool: tool_call 和 tool_result 不能拆开，否则 LLM 会困惑
 */
export function isProtectedMessage(m: ModelMessage): boolean {
  return m.role === 'system' || m.role === 'tool';
}
