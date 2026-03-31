/**
 * Snow 命令行聊天脚本
 *
 * 这是 M1 阶段的主要交互入口，也是未来 Web/QQ/微信壳的参考实现。
 * 业务逻辑在 ChatSession 里，脚本只负责：
 * 1. 加载环境和用户身份
 * 2. readline IO
 * 3. 超时管理
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as readline from 'node:readline';
import { eq } from 'drizzle-orm';
import { getDeepSeekChat } from '../src/ai/models.js';
import { ChatSession } from '../src/session/chat-session.js';
import { SessionTimeoutManager } from '../src/session/timeout.js';
import { db } from '../src/db/client.js';
import { users, userRelations } from '../src/db/schema.js';

// ============================================
// 配置
// ============================================

const platformId = process.argv.includes('--user')
  ? process.argv[process.argv.indexOf('--user') + 1]
  : 'zimu';

/** 对话模型——唯一需要在入口选择的模型 */
const chatModel = getDeepSeekChat();

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

  // 创建会话
  const session = new ChatSession({
    userId: identity.userId,
    userName: identity.userName,
    chatModel,
    relationRole: identity.role,
    relationStage: identity.stage,
    intimacyScore: identity.intimacyScore,
  });

  // 超时管理：30 分钟无消息 → 自动关闭会话
  const timeout = new SessionTimeoutManager({
    onTimeout: async () => {
      console.log('\n\n⏰ 会话超时（30 分钟无消息），自动保存记忆...');
      const summary = await session.close();
      if (summary) console.log(`   ✅ 摘要：${summary}`);
      console.log('\n👋 下次再聊~ \n');
      process.exit(0);
    },
  });

  // 打印欢迎信息
  console.log('');
  console.log('❄️  Snow 命令行聊天');
  console.log(`   用户: ${identity.userName} (${roleLabel})`);
  console.log('   输入消息后回车发送，Ctrl+C 退出');
  console.log('   每 5 轮自动提取记忆，30 分钟无消息自动结束');
  console.log('─'.repeat(40));
  console.log('');

  // readline 交互循环
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function prompt() {
    rl.question('> ', async (input) => {
      const message = input.trim();
      if (!message) { prompt(); return; }

      // 用户发消息，重置超时计时器
      timeout.reset();

      try {
        // 调用 Snow
        process.stdout.write('Snow: ');
        const result = await session.onMessage(message);

        // 消费流式回复
        let fullResponse = '';
        for await (const chunk of result.textStream) {
          process.stdout.write(chunk);
          fullResponse += chunk;
        }
        console.log('\n');

        // 记录本轮对话（可能触发增量记忆提取）
        const extractResult = await session.recordRound(message, fullResponse);
        if (extractResult) {
          console.log(`   💭 记忆：${extractResult.factsWritten} 新增，${extractResult.factsUpdated} 更新，${extractResult.impressionsWritten} 条印象`);
        }
      } catch (err: any) {
        console.error(`\n❌ 错误: ${err.message}\n`);
      }

      prompt();
    });
  }

  // Ctrl+C 退出
  rl.on('close', async () => {
    timeout.clear();
    console.log('\n');
    console.log('   💭 正在保存记忆...');
    const summary = await session.close();
    if (summary) console.log(`   ✅ 摘要：${summary}`);
    console.log('\n👋 下次再聊~ \n');
    process.exit(0);
  });

  prompt();
}

main().catch(console.error);
