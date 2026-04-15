'use client';

import { LogOut, SlidersHorizontal } from 'lucide-react';
import { Avatar } from '../ui/avatar';
import { getChatStatusMeta } from '../../lib/chat/presentation';

interface ChatHeaderProps {
  userLabel: string;
  status: string;
  signOutAction: (formData: FormData) => Promise<void>;
  onSettingsClick?: () => void;
}

export function ChatHeader({ userLabel, status, signOutAction, onSettingsClick }: ChatHeaderProps) {
  const statusMeta = getChatStatusMeta(status);

  return (
    <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
      <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-snow-line to-transparent sm:left-6 sm:right-6" />

      <div className="flex min-w-0 items-center gap-3">
        <Avatar type="snow" size="md" />
        <div className="min-w-0">
          <p className="editorial-kicker">Private Line</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[2.1rem] leading-none text-snow-text-strong">
              Snow
            </h1>
            <span className={`status-pill ${statusMeta.badgeClass}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
              <span>{statusMeta.label}</span>
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-snow-muted">
            当前线路属于 {userLabel}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onSettingsClick ? (
          <button
            type="button"
            onClick={onSettingsClick}
            className="ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs"
            title="个性设定"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">语气设定</span>
          </button>
        ) : null}

        <form action={signOutAction}>
          <button
            type="submit"
            className="ghost-button inline-flex items-center gap-2 px-3 py-2 text-xs"
            title="退出登录"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">退出</span>
          </button>
        </form>
      </div>
    </header>
  );
}
