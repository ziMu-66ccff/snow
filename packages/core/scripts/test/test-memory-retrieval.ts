/**
 * Batch 4 验证脚本：记忆检索 + 跨会话记忆
 * 使用独立测试用户，不污染真实数据
 */
import { config } from 'dotenv';
config({ path: './packages/core/.env.local' });

import { writeMemories } from '../../src/memory/writer.js';
import { retrieveMemories } from '../../src/memory/retriever.js';
import { insertConversation } from '../../src/db/queries/memory-read.js';
import { createTestUser, cleanupTestUser } from './test-utils.js';

async function test() {
  console.log('🧪 Batch 4 验证：记忆检索 + 跨会话记忆\n');

  const { user, relation, platform, platformId } = await createTestUser('memory_retrieval_test');
  console.log('');

  try {
    console.log('═══════════════════════════════════════');
    console.log('📝 第一轮对话：告诉 Snow 信息');
    console.log('═══════════════════════════════════════\n');

    const conversation1 = `用户: 我叫李四，在北京做后端开发
Snow: 你好李四~北京的后端开发，工作忙吗？
用户: 还行，下周三有个技术分享要做
Snow: 技术分享！准备什么主题呀？
用户: 讲微服务架构，有点紧张
Snow: 你一定可以的，记得多喝水放松一下`;

    console.log(conversation1);

    // 直接写入记忆（不走 getChatResponse，因为测试用户不在 DB 里的 platform 映射）
    console.log('\n💾 写入记忆...');
    const writeResult = await writeMemories({ userId: user.id, newMessages: conversation1 });
    console.log(`   事实：${writeResult.factsWritten} 新增，${writeResult.factsUpdated} 更新`);
    console.log(`   印象：${writeResult.impressionsWritten} 条`);

    // 写入对话摘要
    console.log('\n📋 生成对话摘要...');
    await insertConversation({
      userId: user.id,
      platform: '__test__',
      summary: '用户叫李四，在北京做后端开发，下周三有个技术分享讲微服务架构，有点紧张。',
    });
    console.log('   ✅ 摘要已写入');

    console.log('\n═══════════════════════════════════════');
    console.log('🔍 第二轮对话：验证 Snow 还记得');
    console.log('═══════════════════════════════════════\n');

    const message = '你好，我上次跟你说的事怎么样了';
    console.log(`> ${message}\n`);

    const memories = await retrieveMemories(
      user.id, message, { intimacyScore: relation.intimacyScore },
      true, platform, platformId,
    );

    console.log('📦 检索到的记忆：');
    console.log(`   基本事实：${memories.basicFacts ?? '(无)'}`);
    console.log(`   上次摘要：${memories.lastConversationSummary ?? '(无)'}`);
    console.log(`   动态记忆：${memories.dynamicMemories ?? '(无)'}`);

    console.log('\n🎉 Batch 4 验证完成！');
    console.log('✅ 请检查：');
    console.log('   - 记忆检索到了第一轮的信息（名字、城市、事件）');
    console.log('   - 对话摘要存在');
  } finally {
    console.log('\n--- 清理测试数据 ---\n');
    await cleanupTestUser(user.id, platform, platformId);
  }

  process.exit(0);
}

test().catch(console.error);
