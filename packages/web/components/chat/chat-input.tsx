'use client';

import { useRef, useState } from 'react';
import { ArrowUpRight, Square } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isBusy: boolean;
}

export function ChatInput({ onSend, onStop, isBusy }: ChatInputProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function resizeTextarea(element: HTMLTextAreaElement) {
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }

  function handleSubmit() {
    const content = draft.trim();
    if (!content || isBusy) return;

    setDraft('');
    onSend(content);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    resizeTextarea(event.target);
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    handleSubmit();
  }

  const canSend = draft.trim().length > 0;

  return (
    <form onSubmit={handleFormSubmit} className="border-t border-snow-line/80 px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-3xl">
        <div className="input-panel rounded-[28px] p-3 sm:p-4">
          <div className="flex items-start gap-3">
            <div className="hidden pt-2 sm:block">
              <span className="editorial-kicker whitespace-nowrap">Say It Plainly</span>
            </div>

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="把真正想说的那句打出来。"
              className="min-h-[56px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-7 text-snow-text outline-none placeholder:text-snow-muted sm:text-[15px]"
            />

            {isBusy ? (
              <button
                type="button"
                onClick={onStop}
                className="accent-button mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-[18px] px-4 text-sm"
                title="停止"
              >
                <Square size={12} fill="currentColor" />
                <span className="hidden sm:inline">停止</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                className={cn(
                  'accent-button mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-[18px] px-4 text-sm',
                  !canSend && 'cursor-not-allowed opacity-45 saturate-50',
                )}
                title="发送"
              >
                <span className="hidden sm:inline">发送</span>
                <ArrowUpRight size={16} strokeWidth={2.1} />
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-snow-line/70 px-1 pt-3 text-[11px] text-snow-muted">
            <span>Shift + Enter 换行</span>
            <span>{isBusy ? '这轮回应正在生成，可随时停止。' : 'Snow 会带着记忆和情绪来回答。'}</span>
          </div>
        </div>
      </div>
    </form>
  );
}
