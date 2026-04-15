import { config } from 'dotenv';
config({ path: './packages/core/.env.local' });

import { getChatResponse } from '../../src/ai/chat.js';
import { getEmotionContext, updateEmotionState } from '../../src/emotion/engine.js';
import { executeIdleTasks } from '../../src/scheduler/task-scheduler.js';
import { createTestUser, cleanupTestUser } from './test-utils.js';
import { cancelDelayedTask } from '../../src/scheduler/delayed-task.js';

async function sendMessage(platformId: string, platform: string, content: string) {
  const result = await getChatResponse({
    platformId,
    platform,
    messages: [{ role: 'user', content }],
  });

  let full = '';
  for await (const chunk of result.textStream) {
    full += chunk;
  }
  return full;
}

async function test() {
  console.log('🧪 Batch 6 验证：情绪系统\n');
  const testUser = await createTestUser('test_emotion', { intimacyScore: 40 });
  const ownerUser = await createTestUser('test_emotion_owner', {
    role: 'owner',
    stage: 'intimate',
    intimacyScore: 95,
  });

  try {
    console.log('--- 测试 1：低落消息触发 caring / worried ---');
    await sendMessage(testUser.platformId, testUser.platform, '今天真的好累，压力很大');
    const context1 = await getEmotionContext({
      userId: testUser.user.id,
      platform: testUser.platform,
      platformId: testUser.platformId,
      intimacyScore: 40,
    });
    console.log(`当前情绪：${context1.state.primary} (${context1.state.intensity.toFixed(2)})`);

    console.log('\n--- 测试 2：好消息触发 happy ---');
    await sendMessage(testUser.platformId, testUser.platform, '面试过了，终于顺利了');
    const context2 = await getEmotionContext({
      userId: testUser.user.id,
      platform: testUser.platform,
      platformId: testUser.platformId,
      intimacyScore: 40,
    });
    console.log(`当前情绪：${context2.state.primary} (${context2.state.intensity.toFixed(2)})`);

    console.log('\n--- 测试 3：idle 持久化与趋势摘要 ---');
    await executeIdleTasks({
      userId: testUser.user.id,
      platform: testUser.platform,
      platformId: testUser.platformId,
    });
    const context3 = await getEmotionContext({
      userId: testUser.user.id,
      platform: testUser.platform,
      platformId: testUser.platformId,
      intimacyScore: 40,
    });
    console.log(`趋势摘要：${context3.trendSummary ?? '[empty]'}`);

    console.log('\n--- 测试 4：owner 私密调情不应误判为 annoyed ---');
    const ownerEmotion = await updateEmotionState({
      userId: ownerUser.user.id,
      platform: ownerUser.platform,
      platformId: ownerUser.platformId,
      intimacyScore: 95,
      relationRole: 'owner',
      relationStage: 'intimate',
      currentMessage: '我的宝贝，我想把你抱过来，慢慢摸你的大腿和玉足，再把你绑在我怀里。',
    });
    console.log(`owner 事件类型：${ownerEmotion.analysis.eventType}`);
    console.log(`owner 情绪：${ownerEmotion.state.primary} (${ownerEmotion.state.intensity.toFixed(2)})`);
  } finally {
    await cancelDelayedTask(testUser.platform, testUser.platformId);
    await cleanupTestUser(testUser.user.id, testUser.platform, testUser.platformId);
    await cancelDelayedTask(ownerUser.platform, ownerUser.platformId);
    await cleanupTestUser(ownerUser.user.id, ownerUser.platform, ownerUser.platformId);
  }

  process.exit(0);
}

test().catch((error) => {
  console.error(error);
  process.exit(1);
});
