import { Receiver } from '@upstash/qstash';

export const runtime = 'nodejs';

interface IdleTaskPayload {
  userId: string;
  platform: string;
  platformId: string;
  taskId: string;
}

/**
 * QStash 会话结束回调入口。
 *
 * 这里保持极薄：
 * - 验签；
 * - 读取 payload；
 * - 把执行权交回 Snow core。
 */
export async function POST(request: Request): Promise<Response> {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  const callbackUrl = process.env.SNOW_IDLE_TASK_URL;

  if (!currentSigningKey || !nextSigningKey || !callbackUrl) {
    return new Response('QStash callback env is not configured', { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('upstash-signature');

  if (!signature) {
    return new Response('Missing upstash-signature header', { status: 401 });
  }

  const receiver = new Receiver({ currentSigningKey, nextSigningKey });

  try {
    await receiver.verify({
      signature,
      body: rawBody,
      // QStash 签名基于它实际调用的公网 URL。
      // 本地通过 tunnel 转发到 Next 时，request.url 可能是 localhost，
      // 不能拿来做验签基准。
      url: callbackUrl,
    });
  } catch {
    return new Response('Invalid QStash signature', { status: 401 });
  }

  const { handleDelayedTaskCallback } = await import('@snow/core');
  const payload = JSON.parse(rawBody) as IdleTaskPayload;
  const result = await handleDelayedTaskCallback(payload);
  return Response.json(result);
}
