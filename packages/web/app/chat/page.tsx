import { signOutAction } from '../../actions/auth';
import { ChatPageClient } from '../../components/chat/chat-page-client';
import { getCurrentUserOrRedirect } from '../../lib/auth';

interface ChatPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const user = await getCurrentUserOrRedirect();
  const params = (await searchParams) ?? {};
  const notice = typeof params.notice === 'string' ? params.notice : null;

  return (
    <ChatPageClient
      notice={notice === 'account-created' ? '账号已创建，欢迎来到 Snow。' : null}
      userLabel={user.user_metadata?.name ?? user.email ?? user.id}
      signOutAction={signOutAction}
    />
  );
}
