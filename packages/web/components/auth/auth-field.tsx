import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function AuthField({ className, label, ...props }: AuthFieldProps) {
  return (
    <label className="block">
      <span className="editorial-kicker mb-3 block">{label}</span>
      <input
        {...props}
        className={cn('input-shell min-h-[54px] w-full rounded-[20px] px-4 text-sm', className)}
      />
    </label>
  );
}
