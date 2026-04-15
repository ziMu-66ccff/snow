function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

export function getSupabaseUrl(): string {
  return getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
}

/**
 * Web 端统一使用 Supabase 的 publishable key。
 */
export function getSupabasePublishableKey(): string {
  return getRequiredEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
}
