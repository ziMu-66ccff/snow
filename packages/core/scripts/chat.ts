/**
 * Snow 命令行聊天脚本
 *
 * M1 阶段的主要交互入口。
 * core 只提供无状态函数，有状态的组装逻辑由壳自己做。
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import * as readline from 'node:readline';
import { eq } from 'drizzle-orm';
import type { ModelMessage } from 'ai';
import { getChatResponse } from '../src/ai/chat.js';
import { getDeepSeekChat } from '../src/ai/models.js';
import { writeMemories } from '../src/memory/writer.js';
import { retrieveMemories } from '../src/memory/retriever.js';
import { generateAndSaveConversationSummary, compressContextSummary } from '../src/memory/summarizer.js';
import { db } from '../src/db/client.js';
import { users, userRelations } from '../src/db/schema.js';

// ============================================
// 配置
// ============================================

const platformId = process.argv.includes('--user')
  ? process.argv[process.argv.indexOf('--user') + 1]
  : 'zimu';

/** 对话模型 */
const chatModel = getDeepSeekChat();

/** 每 N 轮增量提取一次记忆 */
const EXTRACT_EVERY_N_ROUNDS = 5;

/** 空闲超时：多久没消息自动提取记忆（毫秒） */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// ============================================
// 会话状态（CLI 壳自己管理）
// ============================================

/** 全量对话历史（传给 LLM） */
const history: ModelMessage[] = [];

/** 未提取记忆的消息缓冲区（提取后清空，不依赖 history 下标） */
const unextractedBuffer: ModelMessage[] = [];

/** 上次提取记忆后的轮次计数 */
let roundsSinceLastExtract = 0;

/** 之前已提取部分的摘要（作为下次提取的上下文） */
let extractedContextSummary = '';

/** 会话开始时间 */
const sessionStartedAt = new Date();

/** 空闲计时器 */
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// ============================================
// 工具函数
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

/** 格式化消息为文本（纯函数） */
function formatMessages(messages: ModelMessage[]): string {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '用户' : 'Snow'}: ${m.content}`)
    .join('\n');
}

/** 增量提取记忆：从 buffer 取 → 写 DB → 清空 buffer → 更新上下文摘要 */
async function extractMemoriesFromBuffer(userId: string) {
  if (unextractedBuffer.length === 0) return;

  const newMessagesText = formatMessages(unextractedBuffer);

  console.log('   💭 正在提取记忆...');
  const result = await writeMemories({
    userId,
    newMessages: newMessagesText,
    contextSummary: extractedContextSummary || undefined,
  });

  extractedContextSummary = await compressContextSummary(extractedContextSummary, newMessagesText);
  unextractedBuffer.length = 0;
  roundsSinceLastExtract = 0;

  console.log(`   ✅ 记忆：${result.factsWritten} 新增，${result.factsUpdated} 更新，${result.impressionsWritten} 条印象`);
}

/** 重置空闲计时器：超时后自动提取记忆（不是会话结束，只是兜底保存） */
function resetIdleTimer(userId: string) {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (unextractedBuffer.length > 0) {
      console.log('\n   ⏰ 空闲超时，自动提取记忆...');
      await extractMemoriesFromBuffer(userId);
    }
  }, IDLE_TIMEOUT_MS);
}

/** 善后：提取剩余记忆 + 生成对话摘要（CLI 退出时调用） */
async function close(userId: string) {
  if (idleTimer) clearTimeout(idleTimer);
  if (history.length === 0) return;

  // 保存 buffer 快照（extractMemoriesFromBuffer 会清空 buffer）
  const remainingText = formatMessages(unextractedBuffer);

  // 提取剩余记忆
  if (unextractedBuffer.length > 0) {
    await extractMemoriesFromBuffer(userId);
  }

  // 生成对话摘要（基于压缩摘要 + 最后未提取部分，不用全量 history）
  console.log('   📋 正在生成对话摘要...');
  try {
    const conversationForSummary = extractedContextSummary
      ? `[之前的对话的摘要]\n${extractedContextSummary}\n\n[最近的对话]\n${remainingText}`
      : remainingText;
    const summary = await generateAndSaveConversationSummary({
      userId,
      conversationMessages: conversationForSummary,
      startedAt: sessionStartedAt,
    });
    console.log(`   ✅ 摘要：${summary}`);
  } catch (err: any) {
    console.error(`   ❌ 摘要保存失败: ${err.message}`);
  }
}

// ============================================
// 主流程
// ============================================

async function main() {
  const identity = await loadUserIdentity(platformId);
  const roleLabel = identity.role === 'owner' ? '👑 主人' : `👤 ${identity.stage}`;

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

      // 重置空闲计时器
      resetIdleTimer(identity.userId);

      try {
        // 检索记忆 → 调用 LLM → 流式输出
        const memories = await retrieveMemories(
          identity.userId, message, { intimacyScore: identity.intimacyScore },
        );

        process.stdout.write('Snow: ');
        const result = await getChatResponse({
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

        // 记录到 history + buffer
        const userMsg: ModelMessage = { role: 'user', content: message };
        const assistantMsg: ModelMessage = { role: 'assistant', content: fullResponse };
        history.push(userMsg, assistantMsg);
        unextractedBuffer.push(userMsg, assistantMsg);
        roundsSinceLastExtract++;

        // 每 N 轮增量提取记忆
        if (roundsSinceLastExtract >= EXTRACT_EVERY_N_ROUNDS) {
          await extractMemoriesFromBuffer(identity.userId);
        }
      } catch (err: any) {
        console.error(`\n❌ 错误: ${err.message}\n`);
      }

      prompt();
    });
  }

  // Ctrl+C 退出
  rl.on('close', async () => {
    console.log('\n');
    await close(identity.userId);
    console.log('\n👋 下次再聊~ \n');
    process.exit(0);
  });

  prompt();
}

main().catch(console.error);
