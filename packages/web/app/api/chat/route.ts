import { convertToModelMessages, type UIMessage } from 'ai';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Web 端聊天入口。
 *
 * 这里不负责实现 Snow 逻辑，只做三件事：
 * 1. 校验当前登录用户；
 * 2. 把 AI SDK 的 UIMessage 转换成 core 可接受的 ModelMessage；
 * 3. 调 getChatResponse() 并返回标准 UIMessage stream。
 */
export async function POST(request: Request): Promise<Response> {
  const { getChatResponse } = await import('@snow/core');
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const {
    messages = [],
    customDirective,
  }: {
    messages?: UIMessage[];
    customDirective?: string;
  } = await request.json();
  const incomingMessages = Array.isArray(messages) ? messages : [];
  const modelMessages = await convertToModelMessages(incomingMessages);

  const result = await getChatResponse({
    platform: 'web',
    platformId: user.id,
    name: user.user_metadata?.name,
    messages: modelMessages,
    customDirective: customDirective?.trim() || undefined,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: incomingMessages,
  });
}
