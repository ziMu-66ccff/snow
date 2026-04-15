'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';

function createTextMessage(role: UIMessage['role'], text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    parts: [{ type: 'text', text }],
  };
}

const INITIAL_MESSAGES = [
  createTextMessage('assistant', '你好呀，我是 Snow。今晚想从哪里开始说？'),
];

export function useSnowChat(notice: string | null) {
  const [customDirective, setCustomDirective] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(Boolean(notice));
  const customDirectiveRef = useRef(customDirective);
  const deferredDirective = useDeferredValue(customDirective);

  useEffect(() => {
    customDirectiveRef.current = customDirective;
  }, [customDirective]);

  const dismissNotice = useEffectEvent(() => {
    setNoticeVisible(false);
  });

  useEffect(() => {
    setNoticeVisible(Boolean(notice));

    if (!notice) return;

    const timer = window.setTimeout(() => {
      dismissNotice();
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [dismissNotice, notice]);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({
          customDirective: customDirectiveRef.current.trim() || undefined,
        }),
      }),
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    messages: INITIAL_MESSAGES,
    experimental_throttle: 32,
  });

  const isBusy = status === 'submitted' || status === 'streaming';
  const isThinking = status === 'submitted';

  function sendText(text: string) {
    startTransition(() => {
      sendMessage({ text });
    });
  }

  return {
    customDirective,
    deferredDirective,
    error,
    isBusy,
    isThinking,
    messages,
    noticeVisible,
    settingsOpen,
    status,
    stop,
    closeSettings: () => setSettingsOpen(false),
    dismissNotice,
    openSettings: () => setSettingsOpen(true),
    sendText,
    setCustomDirective,
  };
}
