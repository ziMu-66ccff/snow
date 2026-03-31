/**
 * Snow 命令行聊天脚本
 *
 * M1 阶段的主要交互入口，也是未来 Web/QQ/微信壳的参考实现。
 * 业务逻辑在 ChatSession 里，脚本只负责 IO。
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as readline from 'node:readline';
import { eq } from 'drizzle-orm';
import { getDeepSeekChat } from '../src/ai/models.js';
import { ChatSession } from '../src/session/chat-session.js';
import { db } from '../src/db/client.js';
import { users, userRelations } from '../src/db/schema.js';

// ============================================
// 配置
// ============================================

const platformId = process.argv.includes('--user')
  ? process.argv[process.argv.indexOf('--user') + 1]
  : 'zimu';

// ============================================
// 用户身份加载
// ============================================

/** 从数据库查询用户身份 */
async function loadUserIdentity(platformId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.platformId, platformId),
  });
  if (!user) {
    console.log(`⚠️  用户 "${platformId}" 不在数据库中，将以陌生人身份聊天\n`);
    return { userId: platformId, userName: platformId, role: 'user', stage: 'stranger', intimacyScore: 0 };
  }
  const relation = await db.query.userRelations.findFirst({
    where: eq(userRelations.userId, user.id),
  });
  return {
    userId: user.id,
    userName: user.name ?? platformId,
    role: relation?.role ?? 'user',
    stage: relation?.stage ?? 'stranger',
    intimacyScore: relation?.intimacyScore ?? 0,
  };
}

// ============================================
// 主流程
// ============================================

async function main() {
  const identity = await loadUserIdentity(platformId);
  const roleLabel = identity.role === 'owner' ? '👑 主人' : `👤 ${identity.stage}`;

  // 创建会话（记忆提取、超时等全在内部自动管理）
  const session = new ChatSession({
    userId: identity.userId,
    userName: identity.userName,
    chatModel: getDeepSeekChat(),
    relationRole: identity.role,
    relationStage: identity.stage,
    intimacyScore: identity.intimacyScore,
  });

  console.log('');
  console.log('❄️  Snow 命令行聊天');
  console.log(`   用户: ${identity.userName} (${roleLabel})`);
  console.log('   输入消息后回车发送，Ctrl+C 退出');
  console.log('─'.repeat(40));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function prompt() {
    rl.question('> ', async (input) => {
      const message = input.trim();
      if (!message) { prompt(); return; }

      try {
        process.stdout.write('Snow: ');
        const { textStream } = await session.send(message);
        for await (const chunk of textStream) {
          process.stdout.write(chunk);
        }
        console.log('\n');
      } catch (err: any) {
        console.error(`\n❌ 错误: ${err.message}\n`);
      }

      prompt();
    });
  }

  // Ctrl+C 退出：通知 session 善后（提取剩余记忆 + 摘要）
  rl.on('close', async () => {
    console.log('\n\n   💭 正在保存记忆...');
    const summary = await session.flush();
    if (summary) console.log(`   ✅ 摘要：${summary}`);
    console.log('\n👋 下次再聊~ \n');
    process.exit(0);
  });

  prompt();
}

main().catch(console.error);
