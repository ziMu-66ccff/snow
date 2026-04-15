'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../lib/supabase/server';

function normalizeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unexpected authentication error';
}

function isDuplicateEmailSignUp(data: {
  user?: {
    identities?: ArrayLike<unknown> | null;
  } | null;
}): boolean {
  const identities = data.user?.identities;
  return Array.isArray(identities) && identities.length === 0;
}

/**
 * 校验 name 格式：2-20 字符，允许字母、数字、下划线、中文
 */
function validateName(name: string): string | null {
  if (name.length < 2) return '昵称至少 2 个字符';
  if (name.length > 20) return '昵称最多 20 个字符';
  if (!/^[\w\u4e00-\u9fff]+$/.test(name)) return '昵称只能包含字母、数字、下划线和中文';
  return null;
}

/**
 * 登录当前 Supabase 用户，并在成功后进入聊天页。
 */
export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(normalizeError(error))}`);
  }

  redirect('/chat');
}

/**
 * 注册一个新的 Supabase 用户。
 *
 * 流程：
 * 1. 校验 name 格式
 * 2. 校验 name 唯一性（查 core users 表）
 * 3. Supabase Auth signUp（email + password，metadata 里存 name）
 */
export async function registerAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  // 1. 校验 name 格式
  const nameError = validateName(name);
  if (nameError) {
    redirect(`/register?error=${encodeURIComponent(nameError)}`);
  }

  // 2. Supabase Auth signUp
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    redirect(`/register?error=${encodeURIComponent(normalizeError(error))}`);
  }

  if (isDuplicateEmailSignUp(data)) {
    redirect(`/register?error=${encodeURIComponent('该邮箱已被注册')}`);
  }

  redirect('/chat?notice=account-created');
}

/**
 * 注销当前 Supabase 会话。
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
