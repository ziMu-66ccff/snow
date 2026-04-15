'use client';

import { ChatSidebar } from './chat-sidebar';
import { ChatStage } from './chat-stage';
import { SettingsDrawer } from './settings-drawer';
import { useSnowChat } from './use-snow-chat';

interface ChatPageClientProps {
  notice: string | null;
  userLabel: string;
  signOutAction: (formData: FormData) => Promise<void>;
}

export function ChatPageClient({ notice, userLabel, signOutAction }: ChatPageClientProps) {
  const {
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
    closeSettings,
    dismissNotice,
    openSettings,
    sendText,
    setCustomDirective,
  } = useSnowChat(notice);

  return (
    <main className="relative min-h-dvh overflow-hidden bg-snow-bg text-snow-text">
      <div className="ambient-grid pointer-events-none absolute inset-0" />
      <div className="grain-overlay pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ambient-glow absolute left-[-10%] top-[-12%] h-[28rem] w-[28rem]" />
        <div
          className="ambient-glow absolute bottom-[-20%] right-[-8%] h-[24rem] w-[24rem]"
          style={{ animationDelay: '1.6s' }}
        />
      </div>

      <div className="relative mx-auto grid min-h-dvh max-w-[1520px] grid-cols-1 gap-3 px-3 py-3 md:px-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-4 lg:px-5 lg:py-4">
        <ChatSidebar
          customDirective={deferredDirective}
          messages={messages}
          onOpenSettings={openSettings}
          status={status}
          userLabel={userLabel}
        />

        <ChatStage
          errorMessage={error?.message}
          isBusy={isBusy}
          isThinking={isThinking}
          messages={messages}
          notice={notice}
          noticeVisible={noticeVisible}
          onDismissNotice={dismissNotice}
          onSend={sendText}
          onSettingsClick={openSettings}
          onStop={stop}
          signOutAction={signOutAction}
          status={status}
          userLabel={userLabel}
        />
      </div>

      <SettingsDrawer
        onChange={setCustomDirective}
        onClose={closeSettings}
        open={settingsOpen}
        value={customDirective}
      />
    </main>
  );
}
