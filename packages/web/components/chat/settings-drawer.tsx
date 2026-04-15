'use client';

import { useEffect, useRef, useState } from 'react';
import { PenLine, Sparkles, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
}

export function SettingsDrawer({ open, onClose, value, onChange }: SettingsDrawerProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;

    setVisible(true);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  function handleTransitionEnd() {
    if (!open) setVisible(false);
  }

  if (!visible && !open) return null;

  return (
    <div className="fixed inset-0 z-50" onTransitionEnd={handleTransitionEnd}>
      <div
        className={cn(
          'absolute inset-0 bg-snow-overlay/70 backdrop-blur-md transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          'absolute right-0 top-0 h-full w-full max-w-md border-l border-snow-line bg-[#0d1822]/95 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-6 py-6">
            <div className="space-y-2">
              <p className="editorial-kicker">Tone Direction</p>
              <h2 className="font-display text-[2rem] leading-none text-snow-text-strong">
                改一改她说话的方式
              </h2>
              <p className="text-sm leading-6 text-snow-muted">
                这段描述会在下一轮请求里实时注入，不需要单独保存。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ghost-button h-9 w-9 p-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mx-6 h-px bg-gradient-to-r from-transparent via-snow-line to-transparent" />

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <div className="rounded-[24px] border border-snow-line bg-snow-surface px-4 py-4">
                <div className="flex items-center gap-2 text-snow-text-strong">
                  <Sparkles className="h-4 w-4 text-snow-accent" />
                  <span className="text-sm font-medium">描述你想要的相处方式</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-snow-muted">
                  比如更亲近、更俏皮、更直接，或者更少客套、更像熟人。
                </p>
              </div>

              <textarea
                ref={inputRef}
                rows={7}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder="例如：语气更松弛一点，少一点解释；如果我情绪低落，可以更直接地安慰我。"
                className="input-shell min-h-[220px] w-full resize-none rounded-[24px] px-4 py-4 text-sm leading-7"
              />

              <div className="rounded-[24px] border border-snow-line bg-snow-surface px-4 py-4">
                <div className="flex items-center gap-2 text-snow-text-strong">
                  <PenLine className="h-4 w-4 text-snow-accent" />
                  <span className="text-sm font-medium">写法建议</span>
                </div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-snow-muted-strong">
                  <p>1. 直接描述你要的语气，不用写成 prompt 工程术语。</p>
                  <p>2. 说明“保留什么”和“增加什么”，比只说“更活泼”更稳定。</p>
                  <p>3. 如果你希望她更有边界感，也可以明确写出来。</p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[24px] border border-snow-line bg-snow-surface px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-snow-text-strong">当前长度</p>
                  <p className="mt-1 text-xs text-snow-muted">这段文字会随聊天请求一起发送到 `/api/chat`。</p>
                </div>
                <div className="status-pill border-snow-line bg-snow-accent-soft text-snow-accent-strong">
                  {value.trim().length} 字
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
