import { config } from 'dotenv';
config({ path: '.env.local' });

import * as readline from 'node:readline';
import { eq } from 'drizzle-orm';
import type { ModelMessage } from 'ai';
import { chat } from '../src/ai/chat.js';
import { getDeepSeekChat } from '../src/ai/models.js';
import { writeMemories } from '../src/memory/writer.js';
import { retrieveMemories } from '../src/memory/retriever.js';
import { generateAndSaveConversationSummary, compressContextSummary } from '../src/memory/summarizer.js';
import { SessionTimeoutManager } from '../src/session/timeout.js';
import { db } from '../src/db/client.js';
import { users, userRelations } from '../src/db/schema.js';

const platformId = process.argv.includes('--user')
  ? process.argv[process.argv.indexOf('--user') + 1]
  : 'zimu';

// 对话模型——唯一需要在入口选择的模型
const chatModel = getDeepSeekChat();

/** 全量对话历史（传给 LLM） */
const history: ModelMessage[] = [];

/** 上次提取记忆后的轮次计数（一轮 = user + assistant） */
let roundsSinceLastExtract = 0;

/** 每 N 轮增量提取一次记忆 */
const EXTRACT_EVERY_N_ROUNDS = 5;

/** 上次提取时的 history 长度，用于切分"已提取"和"未提取" */
let lastExtractedAtIndex = 0;

/** 之前已提取部分的摘要（作为下次提取的上下文） */
let extractedContextSummary = '';

const sessionStartedAt = new Date();

/** 是否正在执行会话结束流程（防止超时和 Ctrl+C 重复触发） */
let isClosing = false;

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

/** 格式化消息为文本 */
function formatMessages(messages: ModelMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '用户' : 'Snow'}: ${m.content}`)
    .join('\n');
}

/** 增量提取记忆（每 N 轮调用一次，退出时兜底） */
async function incrementalExtract(userId: string) {
  const newMessages = history.slice(lastExtractedAtIndex);
  if (newMessages.length === 0) return;
  const newMessagesText = formatMessages(newMessages);

  console.log('   💭 正在提取记忆...');
  const result = await writeMemories({
    userId,
    newMessages: newMessagesText,
    contextSummary: extractedContextSummary || undefined,
  });

  extractedContextSummary = await compressContextSummary(extractedContextSummary, newMessagesText);
  lastExtractedAtIndex = history.length;
  roundsSinceLastExtract = 0;

  console.log(`   ✅ 记忆：${result.factsWritten} 新增，${result.factsUpdated} 更新，${result.impressionsWritten} 条印象`);
}

/** 会话结束流程（提取剩余记忆 + 生成摘要） */
async function closeSession(userId: string) {
  if (isClosing) return;
  isClosing = true;
  if (history.length === 0) return;

  console.log('\n');
  if (lastExtractedAtIndex < history.length) {
    await incrementalExtract(userId);
  }

  console.log('   📋 正在生成对话摘要...');
  try {
    const fullConversation = formatMessages(history);
    const summary = await generateAndSaveConversationSummary({
      userId,
      conversationMessages: fullConversation,
      startedAt: sessionStartedAt,
    });
    console.log(`   ✅ 摘要：${summary}`);
  } catch (err: any) {
    console.error(`   ❌ 摘要保存失败: ${err.message}`);
  }
}

async function main() {
  const identity = await loadUserIdentity(platformId);
  const roleLabel = identity.role === 'owner' ? '👑 主人' : `👤 ${identity.stage}`;

  const timeout = new SessionTimeoutManager({
    onTimeout: async () => {
      console.log('\n\n⏰ 会话超时（30 分钟无消息），自动保存记忆...');
      await closeSession(identity.userId);
      console.log('\n👋 下次再聊~ \n');
      process.exit(0);
    },
  });

  console.log('');
  console.log('❄️  Snow 命令行聊天');
  console.log(`   用户: ${identity.userName} (${roleLabel})`);
  console.log('   输入消息后回车发送，Ctrl+C 退出');
  console.log(`   每 ${EXTRACT_EVERY_N_ROUNDS} 轮自动提取记忆，30 分钟无消息自动结束`);
  console.log('─'.repeat(40));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  function prompt() {
    rl.question('> ', async (input) => {
      const message = input.trim();
      if (!message) { prompt(); return; }

      // 用户发消息，重置超时计时器
      timeout.reset();

      try {
        // 每次对话前检索记忆
        const memories = await retrieveMemories(
          identity.userId, message, { intimacyScore: identity.intimacyScore },
        );

        process.stdout.write('Snow: ');
        const result = await chat({
          model: chatModel,
          userId: identity.userId,
          userName: identity.userName,
          message,
          history,
          relationRole: identity.role,
          relationStage: identity.stage,
          basicFacts: memories.basicFacts,
          lastConversationSummary: memories.lastConversationSummary,
          dynamicMemories: memories.dynamicMemories,
        });

        let fullResponse = '';
        for await (const chunk of result.textStream) {
          process.stdout.write(chunk);
          fullResponse += chunk;
        }
        console.log('\n');

        // 维护对话历史
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: fullResponse });
        roundsSinceLastExtract++;

        // 每 N 轮增量提取记忆
        if (roundsSinceLastExtract >= EXTRACT_EVERY_N_ROUNDS) {
          await incrementalExtract(identity.userId);
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
    await closeSession(identity.userId);
    console.log('\n👋 下次再聊~ \n');
    process.exit(0);
  });

  prompt();
}

main().catch(console.error);
