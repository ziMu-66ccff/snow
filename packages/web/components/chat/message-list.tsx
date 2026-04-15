'use client';

import { useEffect, useRef } from 'react';
import type { UIMessage } from 'ai';
import { ConversationIntro } from './conversation-intro';
import { MessageBubble } from './message-bubble';
import { Avatar } from '../ui/avatar';
import { TypingIndicator } from '../ui/typing-indicator';

interface MessageListProps {
  messages: UIMessage[];
  userLabel?: string;
  isThinking?: boolean;
}

export function MessageList({ messages, userLabel, isThinking }: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;

    if (isNearBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isThinking]);

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.length <= 1 ? <ConversationIntro userLabel={userLabel ?? '你'} /> : null}

        {messages.map(message => (
          <MessageBubble key={message.id} message={message} userLabel={userLabel} />
        ))}

        {isThinking ? (
          <div className="message-entry flex gap-4">
            <div className="mt-1 shrink-0">
              <Avatar type="snow" size="sm" />
            </div>
            <div className="message-card message-card-snow max-w-[min(100%,46rem)] rounded-[24px] px-4 py-3.5">
              <TypingIndicator />
            </div>
          </div>
        ) : null}

        <div ref={endRef} />
      </div>
    </div>
  );
}
