'use client';

import { cn } from '../../lib/utils';

interface AvatarProps {
  type: 'snow' | 'user';
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const sizeMap = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-12 w-12 text-xs',
};

export function Avatar({ type, label, size = 'md', className }: AvatarProps) {
  if (type === 'snow') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-[18px] border border-snow-line bg-[linear-gradient(145deg,rgba(215,186,125,0.22),rgba(15,24,34,0.88))] font-display text-snow-text-strong shadow-[0_14px_30px_rgba(0,0,0,0.24)]',
          sizeMap[size],
          className,
        )}
      >
        S
      </div>
    );
  }

  const initial = label?.charAt(0).toUpperCase() ?? '?';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[18px]',
        'border border-snow-line bg-snow-surface font-medium text-snow-muted-strong',
        sizeMap[size],
        className,
      )}
    >
      {initial}
    </div>
  );
}
