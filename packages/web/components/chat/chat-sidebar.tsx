'use client';

import type { UIMessage } from 'ai';
import { Compass, MessageSquareQuote, PenSquare, Sparkles, UserRound } from 'lucide-react';
import { Avatar } from '../ui/avatar';
import {
  formatDirectivePreview,
  getChatStatusMeta,
  getConversationTurnCount,
  getLastUserMessage,
} from '../../lib/chat/presentation';

interface ChatSidebarProps {
  customDirective: string;
  messages: UIMessage[];
  onOpenSettings: () => void;
  status: string;
  userLabel: string;
}

export function ChatSidebar({
  customDirective,
  messages,
  onOpenSettings,
  status,
  userLabel,
}: ChatSidebarProps) {
  const statusMeta = getChatStatusMeta(status);
  const turnCount = getConversationTurnCount(messages);
  const lastUserMessage = getLastUserMessage(messages);
  const directivePreview = formatDirectivePreview(customDirective);

  return (
    <aside className="hidden min-h-[calc(100dvh-2rem)] flex-col gap-4 lg:flex">
      <section className="panel-frame relative overflow-hidden rounded-[32px] px-6 py-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[radial-gradient(circle_at_center,rgba(215,186,125,0.16),transparent_72%)]" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="editorial-kicker">Private Companion Line</p>
            <h1 className="mt-3 font-display text-[3.5rem] leading-none text-snow-text-strong">
              Snow
            </h1>
          </div>
          <Avatar type="snow" size="md" />
        </div>

        <p className="mt-4 text-sm leading-7 text-snow-muted-strong">
          温柔、克制、会记得你真正说过的话。这个界面现在更像一间夜间礼宾台，而不是通用聊天模板。
        </p>

        <div className="mt-6 flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${statusMeta.dotClass}`} />
          <span className={`status-pill ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
        </div>
      </section>

      <section className="panel-frame rounded-[28px] px-5 py-5">
        <div className="flex items-center justify-between">
          <p className="editorial-kicker">Session Snapshot</p>
          <Compass className="h-4 w-4 text-snow-accent" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="metric-card">
            <span className="metric-value">{turnCount}</span>
            <span className="metric-label">轮对话</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{customDirective.trim() ? '开' : '关'}</span>
            <span className="metric-label">语气定制</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{statusMeta.label}</span>
            <span className="metric-label">状态</span>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-snow-line bg-snow-surface px-4 py-4">
          <div className="flex items-center gap-2 text-snow-text-strong">
            <UserRound className="h-4 w-4 text-snow-accent" />
            <span className="text-sm font-medium">当前用户</span>
          </div>
          <p className="mt-2 text-sm text-snow-muted-strong">{userLabel}</p>
          <p className="mt-2 text-xs leading-6 text-snow-muted">
            {statusMeta.detail}
          </p>
        </div>
      </section>

      <section className="panel-frame flex flex-1 flex-col rounded-[28px] px-5 py-5">
        <div className="flex items-center justify-between">
          <p className="editorial-kicker">Tone Direction</p>
          <button
            type="button"
            onClick={onOpenSettings}
            className="ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs"
          >
            <PenSquare className="h-3.5 w-3.5" />
            调整
          </button>
        </div>

        <div className="mt-4 rounded-[24px] border border-snow-line bg-snow-surface px-4 py-4">
          <div className="flex items-center gap-2 text-snow-text-strong">
            <Sparkles className="h-4 w-4 text-snow-accent" />
            <span className="text-sm font-medium">对话气质</span>
          </div>
          <p className="mt-3 text-sm leading-7 text-snow-muted-strong">
            {directivePreview}
          </p>
        </div>

        <div className="mt-4 rounded-[24px] border border-snow-line bg-snow-surface px-4 py-4">
          <div className="flex items-center gap-2 text-snow-text-strong">
            <MessageSquareQuote className="h-4 w-4 text-snow-accent" />
            <span className="text-sm font-medium">上一句你说了什么</span>
          </div>
          <p className="mt-3 text-sm leading-7 text-snow-muted-strong">
            {lastUserMessage ?? '这条线路刚刚打开，还没有新的用户消息。'}
          </p>
        </div>
      </section>
    </aside>
  );
}
