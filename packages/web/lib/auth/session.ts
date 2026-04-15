import { createSupabaseServerClient } from '../supabase/server';

/**
 * 返回当前 Supabase 会话。
 *
 * 这一层只负责读取会话，不做重定向等页面控制逻辑。
 */
export async function getCurrentSession() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session;
}
