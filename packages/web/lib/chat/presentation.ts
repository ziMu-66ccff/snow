import type { UIMessage } from 'ai';

export interface ChatStatusMeta {
  label: string;
  detail: string;
  badgeClass: string;
  dotClass: string;
}

const STATUS_META: Record<string, ChatStatusMeta> = {
  submitted: {
    label: '思考中',
    detail: 'Snow 正在整理语气和记忆',
    badgeClass: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
    dotClass: 'bg-amber-300',
  },
  streaming: {
    label: '回应中',
    detail: 'Snow 已经开始说话了',
    badgeClass: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100',
    dotClass: 'bg-emerald-300',
  },
  ready: {
    label: '在线',
    detail: '这条线路随时都能继续',
    badgeClass: 'border-snow-line bg-snow-accent-soft text-snow-accent-strong',
    dotClass: 'bg-snow-accent',
  },
  error: {
    label: '连接异常',
    detail: '这轮消息没有成功送达',
    badgeClass: 'border-red-300/20 bg-red-300/10 text-red-100',
    dotClass: 'bg-snow-danger',
  },
};

export function getChatStatusMeta(status: string): ChatStatusMeta {
  return STATUS_META[status] ?? STATUS_META.ready;
}

export function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('');
}

export function getConversationTurnCount(messages: UIMessage[]): number {
  return messages.filter(message => message.role === 'user').length;
}

export function getLastUserMessage(messages: UIMessage[]): string | null {
  const latest = [...messages].reverse().find(message => message.role === 'user');
  if (!latest) return null;

  const text = getMessageText(latest).trim();
  return text.length > 0 ? text : null;
}

export function formatDirectivePreview(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '暂未设定额外语气，Snow 会使用默认的人设与关系层来回应你。';
  }

  return trimmed;
}
