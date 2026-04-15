'use client';

import type { UIMessage } from 'ai';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { MessageList } from './message-list';

interface ChatStageProps {
  errorMessage?: string;
  isBusy: boolean;
  isThinking: boolean;
  messages: UIMessage[];
  notice: string | null;
  noticeVisible: boolean;
  onDismissNotice: () => void;
  onSend: (text: string) => void;
  onSettingsClick: () => void;
  onStop: () => void;
  signOutAction: (formData: FormData) => Promise<void>;
  status: string;
  userLabel: string;
}

export function ChatStage({
  errorMessage,
  isBusy,
  isThinking,
  messages,
  notice,
  noticeVisible,
  onDismissNotice,
  onSend,
  onSettingsClick,
  onStop,
  signOutAction,
  status,
  userLabel,
}: ChatStageProps) {
  return (
    <section className="min-h-[calc(100dvh-1.5rem)] min-w-0">
      <div className="panel-frame relative flex h-full min-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-[32px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,rgba(215,186,125,0.12),transparent_72%)]" />

        <ChatHeader
          onSettingsClick={onSettingsClick}
          signOutAction={signOutAction}
          status={status}
          userLabel={userLabel}
        />

        {noticeVisible && notice ? (
          <div className="px-4 pb-2 sm:px-6">
            <div className="banner banner-success">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm leading-6">{notice}</p>
              </div>
              <button
                type="button"
                onClick={onDismissNotice}
                className="ghost-button h-8 w-8 shrink-0 p-0"
                aria-label="关闭提示"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="px-4 pb-2 sm:px-6">
            <div className="banner banner-danger">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm leading-6">{errorMessage}</p>
              </div>
            </div>
          </div>
        ) : null}

        <MessageList
          isThinking={isThinking}
          messages={messages}
          userLabel={userLabel}
        />

        <ChatInput
          isBusy={isBusy}
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </section>
  );
}
