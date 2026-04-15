'use client';

import type { UIMessage } from 'ai';
import { Avatar } from '../ui/avatar';
import { cn } from '../../lib/utils';
import { getMessageText } from '../../lib/chat/presentation';

interface MessageBubbleProps {
  message: UIMessage;
  userLabel?: string;
}

export function MessageBubble({ message, userLabel }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const text = getMessageText(message);

  return (
    <div
      className={cn(
        'message-entry flex gap-4 animate-fade-in-up',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <div className="mt-1 shrink-0">
        {isUser ? (
          <Avatar type="user" label={userLabel} size="sm" />
        ) : (
          <Avatar type="snow" size="sm" />
        )}
      </div>

      <div className={cn('max-w-[min(100%,46rem)]', isUser ? 'items-end text-right' : 'items-start')}>
        <div className={cn('mb-2 flex items-center gap-2 px-1 text-[11px] text-snow-muted', isUser ? 'justify-end' : 'justify-start')}>
          <span className="editorial-kicker !mb-0">{isUser ? 'You' : 'Snow'}</span>
          <span className="h-px w-8 bg-snow-line" />
          <span>{isUser ? (userLabel ?? '你') : '保持在线'}</span>
        </div>

        <article
          className={cn(
            'message-card rounded-[24px] px-4 py-3 text-[14px] leading-7 sm:px-5 sm:text-[15px]',
            isUser ? 'message-card-user' : 'message-card-snow',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{text || '...'}</p>
        </article>
      </div>
    </div>
  );
}
