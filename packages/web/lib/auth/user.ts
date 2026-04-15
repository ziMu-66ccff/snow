import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../supabase/server';

/**
 * 返回当前登录用户。
 *
 * 如果当前请求没有登录用户，则返回 `null`。
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * 返回当前登录用户；若未登录则直接跳转到登录页。
 */
export async function getCurrentUserOrRedirect() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}
