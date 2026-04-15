/**
 * Batch 7 验证脚本：外部自定义 + 完整循环
 *
 * 目标：
 * 1. 通过 getChatResponse 显式传入 customDirective
 * 2. 跑通一次完整的对话 → onFinish → finalizeSession
 * 3. 验证记忆、关系、情绪、摘要都已落库
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import type { ModelMessage } from 'ai';
import { getChatResponse, finalizeSession } from '../../src/ai/chat.js';
import { composeSystemPrompt } from '../../src/ai/prompts-composer.js';
import { db } from '../../src/db/client.js';
import {
  factualMemories,
  semanticMemories,
  conversations,
  emotionStates,
  emotionTrends,
  userRelations,
} from '../../src/db/schema.js';
import { retrieveMemories } from '../../src/memory/retriever.js';
import { getEmotionContext } from '../../src/emotion/engine.js';
import { createTestUser, cleanupTestUser } from './test-utils.js';

async function streamChat(
  platformId: string,
  platform: string,
  messages: ModelMessage[],
  customDirective?: string,
): Promise<string> {
  const result = await getChatResponse({
    platformId,
    platform,
    messages,
    customDirective,
  });

  let full = '';
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
    full += chunk;
  }
  console.log('\n');
  return full;
}

async function test() {
  console.log('🧪 Batch 7 验证：外部自定义 + 完整循环\n');

  const customDirective = [
    '你和这个用户说话时可以更放松一些，少一点客套。',
    '可以更主动地表达关心，但不要变成话痨。',
    '当气氛轻松时，可以更自然地使用短句和一点俏皮感。',
  ].join('\n');

  const { user, relation, platform, platformId } = await createTestUser('full_loop_test', {
    role: 'user',
    stage: 'familiar',
    intimacyScore: 35,
  });

  const messages: ModelMessage[] = [];

  try {
    console.log('--- 测试 1：Prompt 组装接受外部 customDirective ---\n');

    const previewPrompt = composeSystemPrompt({
      userId: user.id,
      userName: user.name ?? 'full_loop_test',
      relationRole: relation.role,
      relationStage: relation.stage,
      composedDirective: customDirective,
      emotionPrimary: 'neutral',
      emotionIntensity: 0.3,
    });

    const customLayerInjected = previewPrompt.includes('## 用户个性化偏好')
      && previewPrompt.includes('更放松一些');
    console.log(`自定义层注入：${customLayerInjected ? '✅' : '❌'}`);
    if (!customLayerInjected) {
      throw new Error('Prompt 中没有注入 customDirective');
    }

    console.log('\n--- 测试 2：真实对话（带外部自定义） ---\n');

    const firstUserMessage = '我叫林泽，最近在准备一个重要面试，其实有点紧张。';
    console.log(`> ${firstUserMessage}\n`);
    process.stdout.write('Snow: ');
    messages.push({ role: 'user', content: firstUserMessage });
    const firstReply = await streamChat(platformId, platform, messages, customDirective);
    messages.push({ role: 'assistant', content: firstReply });

    const secondUserMessage = '不过我真的很想把这次机会抓住，我还喜欢用热巧克力让自己冷静一点。';
    console.log(`> ${secondUserMessage}\n`);
    process.stdout.write('Snow: ');
    messages.push({ role: 'user', content: secondUserMessage });
    const secondReply = await streamChat(platformId, platform, messages, customDirective);
    messages.push({ role: 'assistant', content: secondReply });

    // 等 onFinish 的异步写入先跑完，再触发完整 idle 收尾。
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('--- 测试 3：执行完整收尾流程 ---\n');
    await finalizeSession(platformId, platform);

    console.log('--- 测试 4：验证记忆 / 关系 / 情绪 / 摘要 ---\n');

    const [facts, semantics, relationAfter, summaries, emotions, trends] = await Promise.all([
      db.query.factualMemories.findMany({ where: eq(factualMemories.userId, user.id) }),
      db.query.semanticMemories.findMany({ where: eq(semanticMemories.userId, user.id) }),
      db.query.userRelations.findFirst({ where: eq(userRelations.userId, user.id) }),
      db.query.conversations.findMany({ where: eq(conversations.userId, user.id) }),
      db.query.emotionStates.findMany({ where: eq(emotionStates.userId, user.id) }),
      db.query.emotionTrends.findMany({ where: eq(emotionTrends.userId, user.id) }),
    ]);

    console.log(`事实记忆：${facts.length > 0 ? `✅ ${facts.length} 条` : '❌ 0 条'}`);
    console.log(`语义记忆：${semantics.length > 0 ? `✅ ${semantics.length} 条` : '❌ 0 条'}`);
    console.log(`关系记录：${relationAfter ? `✅ intimacy=${relationAfter.intimacyScore}, stage=${relationAfter.stage}` : '❌ 无'}`);
    console.log(`对话摘要：${summaries.length > 0 ? `✅ ${summaries.length} 条` : '❌ 0 条'}`);
    console.log(`情绪快照：${emotions.length > 0 ? `✅ ${emotions.length} 条` : '❌ 0 条'}`);
    console.log(`情绪趋势：${trends.length > 0 ? `✅ ${trends.length} 条` : '❌ 0 条'}`);

    if (facts.length === 0) throw new Error('没有写入 factual_memories');
    if (semantics.length === 0) throw new Error('没有写入 semantic_memories');
    if (!relationAfter) throw new Error('没有 user_relations 记录');
    if (summaries.length === 0) throw new Error('没有写入 conversations 摘要');
    if (emotions.length === 0) throw new Error('没有写入 emotion_states');
    if (trends.length === 0) throw new Error('没有写入 emotion_trends');

    console.log('\n--- 测试 5：新会话记忆检索仍可工作 ---\n');
    const memories = await retrieveMemories(
      user.id,
      '你好，我上次和你说过什么来着？',
      { intimacyScore: relationAfter.intimacyScore },
      true,
      platform,
      platformId,
    );
    console.log(`基本事实注入：${memories.basicFacts ? '✅' : '❌'}`);
    console.log(`上次摘要注入：${memories.lastConversationSummary ? '✅' : '❌'}`);

    const emotionContext = await getEmotionContext({
      userId: user.id,
      platform,
      platformId,
      intimacyScore: relationAfter.intimacyScore,
    });
    console.log(`当前情绪恢复：✅ ${emotionContext.state.primary} (${emotionContext.state.intensity.toFixed(2)})`);

    if (!memories.basicFacts) throw new Error('新会话无法取回基本事实');
    if (!memories.lastConversationSummary) throw new Error('新会话无法取回上次摘要');

    console.log('\n🎉 Batch 7 验证完成！');
    console.log('✅ 外部 customDirective 已注入 Prompt');
    console.log('✅ 对话后完整循环已跑通');
    console.log('✅ 新会话可继续读取记忆与情绪上下文');
  } finally {
    console.log('\n--- 清理测试数据 ---\n');

    const { cancelDelayedTask } = await import('../../src/scheduler/delayed-task.js');
    await cancelDelayedTask(platform, platformId);

    await cleanupTestUser(user.id, platform, platformId);
  }

  process.exit(0);
}

test().catch(console.error);
