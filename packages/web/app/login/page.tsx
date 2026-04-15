import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loginAction } from '../../actions/auth';
import { AuthField } from '../../components/auth/auth-field';
import { getCurrentUser } from '../../lib/auth';
import { AuthLayout } from '../../components/auth/auth-layout';

interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();
  if (user) redirect('/chat');

  const params = (await searchParams) ?? {};
  const error = typeof params.error === 'string' ? params.error : null;

  return (
    <AuthLayout title="欢迎回来" subtitle="Snow 还记得你。登录后继续聊天吧。">
      <form action={loginAction} className="space-y-5">
        <AuthField
          type="email"
          name="email"
          required
          label="邮箱"
          placeholder="you@example.com"
        />

        <AuthField
          type="password"
          name="password"
          required
          minLength={6}
          label="密码"
          placeholder="至少 6 位"
        />

        {error ? (
          <div className="banner banner-danger">
            {error}
          </div>
        ) : null}

        <button type="submit" className="accent-button w-full rounded-[20px] px-4 py-3.5 text-sm">
          登录
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-snow-muted">
        还没有账号？{' '}
        <Link href="/register" className="font-medium text-snow-accent transition-colors hover:text-snow-accent-strong">
          去注册
        </Link>
      </p>
    </AuthLayout>
  );
}
