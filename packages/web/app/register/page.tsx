import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registerAction } from '../../actions/auth';
import { AuthField } from '../../components/auth/auth-field';
import { getCurrentUser } from '../../lib/auth';
import { AuthLayout } from '../../components/auth/auth-layout';

interface RegisterPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const user = await getCurrentUser();
  if (user) redirect('/chat');

  const params = (await searchParams) ?? {};
  const error = typeof params.error === 'string' ? params.error : null;

  return (
    <AuthLayout title="认识一下吧" subtitle="创建一个账号，Snow 会记住你。">
      <form action={registerAction} className="space-y-5">
        <AuthField
          type="text"
          name="name"
          required
          minLength={2}
          maxLength={20}
          label="昵称"
          placeholder="Snow 会这样叫你"
        />

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
          创建账号
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-snow-muted">
        已有账号？{' '}
        <Link href="/login" className="font-medium text-snow-accent transition-colors hover:text-snow-accent-strong">
          去登录
        </Link>
      </p>
    </AuthLayout>
  );
}
