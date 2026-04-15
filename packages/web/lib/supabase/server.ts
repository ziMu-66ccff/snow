import { cookies } from 'next/headers';
import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { getSupabasePublishableKey, getSupabaseUrl } from './shared';

/**
 * 服务端 Supabase 客户端。
 *
 * 使用 SSR cookie 适配器，让 Route Handler、Server Component、Server Action
 * 都能共享同一套认证状态。
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component 场景下 cookie 可能是只读的；真正写回由 middleware 兜底。
        }
      },
    },
  });
}
