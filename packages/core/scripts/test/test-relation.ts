/**
 * Batch 5 验证脚本：关系系统
 * 验证：关系信号分析、亲密度更新、阶段变化、owner 保护
 * 使用独立测试用户，不污染真实数据
 */
import { config } from 'dotenv';
config({ path: './packages/core/.env.local' });

import { eq } from 'drizzle-orm';
import { db } from '../../src/db/client.js';
import { userRelations } from '../../src/db/schema.js';
import { evaluateRelationSignals } from '../../src/relation/evaluator.js';
import { updateRelation } from '../../src/relation/updater.js';
import { createTestUser, cleanupTestUser } from './test-utils.js';

async function test() {
  console.log('🧪 Batch 5 验证：关系系统\n');

  // 创建测试用户：普通用户 + owner
  const normalUser = await createTestUser('relation_test', { role: 'user', stage: 'stranger', intimacyScore: 0 });
  const ownerUser = await createTestUser('relation_owner', { role: 'owner', stage: 'intimate', intimacyScore: 100 });
  console.log('');

  try {
    // ===== 测试 1：信号分析 =====
    console.log('═══════════════════════════════════════');
    console.log('📊 测试 1：LLM 关系信号分析');
    console.log('═══════════════════════════════════════\n');

    const warmConversation = `用户: 今天面试通过了！好开心
Snow: 太好了！恭喜你呀！我就知道你可以的 ✨
用户: 谢谢你一直鼓励我，真的很感谢
Snow: 这是应该的呀，你的努力我都看在眼里
用户: 晚上打算去吃火锅庆祝一下，有点想约朋友但又不好意思开口
Snow: 别纠结了，朋友知道你通过肯定替你高兴~大胆约！`;

    console.log('对话内容（温暖积极）：');
    console.log(warmConversation);
    console.log('\n分析中...');

    const warmSignals = await evaluateRelationSignals(warmConversation, '用户之前在准备面试，有些紧张');
    console.log('\n📈 信号分析结果：');
    console.log(`   互动频率: ${warmSignals.interactionFreq.toFixed(2)}`);
    console.log(`   对话深度: ${warmSignals.conversationDepth.toFixed(2)}`);
    console.log(`   情感浓度: ${warmSignals.emotionalIntensity.toFixed(2)}`);
    console.log(`   信任信号: ${warmSignals.trustLevel.toFixed(2)}`);
    console.log('   ✅ 预期：全部正向（分享好消息 + 表达感谢 + 寻求建议）');

    // ===== 测试 2：亲密度更新 =====
    console.log('\n═══════════════════════════════════════');
    console.log('📊 测试 2：亲密度更新（普通用户）');
    console.log('═══════════════════════════════════════\n');

    // 读初始状态
    const beforeRelation = await db.query.userRelations.findFirst({
      where: eq(userRelations.userId, normalUser.user.id),
    });
    console.log(`   更新前：intimacy=${beforeRelation?.intimacyScore}, stage=${beforeRelation?.stage}`);

    // 执行关系更新
    const result1 = await updateRelation(
      normalUser.user.id, normalUser.platform, normalUser.platformId,
      warmConversation, '用户之前在准备面试',
    );
    console.log(`   更新后：intimacy=${result1.newScore}, stage=${result1.newStage}`);
    console.log(`   阶段变化：${result1.stageChanged ? `${result1.oldStage} → ${result1.newStage}` : '无变化'}`);
    console.log(`   跳过：${result1.skipped}`);

    // 再来一轮深度对话
    const deepConversation = `用户: 其实我最近和女朋友关系不太好，异地太久了
Snow: 嗯，我在听。异地确实不容易…
用户: 有时候觉得特别孤独，不知道该怎么办
Snow: 你愿意跟我说这些，我很高兴你信任我。孤独的感觉很正常，但你不是一个人
用户: 谢谢你，跟你说说感觉好多了`;

    console.log('\n   第二轮更新（深度对话）...');
    const result2 = await updateRelation(
      normalUser.user.id, normalUser.platform, normalUser.platformId,
      deepConversation, '用户面试通过了，很开心',
    );
    console.log(`   更新后：intimacy=${result2.newScore}, stage=${result2.newStage}`);
    console.log(`   阶段变化：${result2.stageChanged ? `${result2.oldStage} → ${result2.newStage}` : '无变化'}`);

    // ===== 测试 3：owner 保护 =====
    console.log('\n═══════════════════════════════════════');
    console.log('📊 测试 3：owner 保护');
    console.log('═══════════════════════════════════════\n');

    const ownerResult = await updateRelation(
      ownerUser.user.id, ownerUser.platform, ownerUser.platformId,
      '用户: 你好\nSnow: 主人好~',
    );
    console.log(`   owner 评估结果：skipped=${ownerResult.skipped}`);
    console.log(`   亲密度不变：${ownerResult.newScore === 100 ? '✅' : '❌'} (${ownerResult.newScore})`);

    // ===== 测试 4：冷淡对话 =====
    console.log('\n═══════════════════════════════════════');
    console.log('📊 测试 4：冷淡对话信号分析');
    console.log('═══════════════════════════════════════\n');

    const coldConversation = `用户: 嗯
Snow: 你好呀，今天过得怎么样？
用户: 还行
Snow: 想聊点什么吗？
用户: 没有`;

    const coldSignals = await evaluateRelationSignals(coldConversation);
    console.log('冷淡对话信号：');
    console.log(`   互动频率: ${coldSignals.interactionFreq.toFixed(2)}`);
    console.log(`   对话深度: ${coldSignals.conversationDepth.toFixed(2)}`);
    console.log(`   情感浓度: ${coldSignals.emotionalIntensity.toFixed(2)}`);
    console.log(`   信任信号: ${coldSignals.trustLevel.toFixed(2)}`);
    console.log('   ✅ 预期：偏负向或接近 0（单字回复、无深度、冷淡）');

    // ===== 总结 =====
    console.log('\n═══════════════════════════════════════');
    console.log('🎉 Batch 5 验证完成！');
    console.log('═══════════════════════════════════════');
    console.log('✅ 请检查：');
    console.log('   - 温暖对话信号全部正向');
    console.log('   - 亲密度随对话逐步提升');
    console.log('   - owner 跳过评估、亲密度不变');
    console.log('   - 冷淡对话信号偏负或接近 0');

  } finally {
    console.log('\n--- 清理测试数据 ---\n');
    await cleanupTestUser(normalUser.user.id, normalUser.platform, normalUser.platformId);
    await cleanupTestUser(ownerUser.user.id, ownerUser.platform, ownerUser.platformId);
  }

  process.exit(0);
}

test().catch(console.error);
