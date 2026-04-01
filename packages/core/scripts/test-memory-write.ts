/**
 * Batch 3 验证脚本：记忆提取 + 写入
 * 使用独立测试用户，不污染真实数据
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { writeMemories } from '../src/memory/writer.js';
import { getFactualMemoriesForUser } from '../src/db/queries/memory-write.js';
import { db } from '../src/db/client.js';
import { semanticMemories } from '../src/db/schema.js';
import { createTestUser, cleanupTestUser } from './test-utils.js';

async function test() {
  console.log('🧪 Batch 3 验证：记忆提取 + 写入\n');

  const { user, platform, platformId } = await createTestUser('memory_write_test');
  console.log('');

  try {
    const conversation = `用户: 我叫张三，在深圳做前端开发
Snow: 你好呀张三~深圳的前端开发，听起来挺忙的吧？
用户: 是啊，下周五有个面试，在腾讯
Snow: 腾讯面试！这个挺重要的，紧张吗？
用户: 有点紧张，不过我挺喜欢吃火锅来减压的
Snow: 火锅确实治愈~面试前记得好好休息，别熬夜刷题刷到太晚哦
用户: 好的，对了我女朋友叫小美，她也在帮我准备面试
Snow: 小美真好呀，有人陪着一起准备，感觉会安心很多`;

    console.log('📝 模拟对话内容：');
    console.log(conversation);
    console.log('\n--- 开始提取记忆 ---\n');

    const result = await writeMemories({ userId: user.id, newMessages: conversation });

    console.log('📊 提取结果：');
    console.log(`   事实记忆：${result.factsWritten} 新增，${result.factsUpdated} 更新`);
    console.log(`   语义印象：${result.impressionsWritten} 条\n`);

    console.log('📋 提取的事实记忆：');
    for (const fact of result.extraction.facts) {
      console.log(`   ✅ { category: "${fact.category}", key: "${fact.key}", value: "${fact.value}", importance: ${fact.importance} }`);
    }

    console.log('\n📋 提取的语义印象：');
    for (const imp of result.extraction.impressions) {
      console.log(`   ✅ "${imp.content}" (importance: ${imp.importance}, emotion: ${imp.emotionalIntensity}, topic: ${imp.topic})`);
    }

    console.log('\n--- 验证数据库 ---\n');

    const facts = await getFactualMemoriesForUser(user.id);
    console.log(`📦 事实记忆（共 ${facts.length} 条）：`);
    for (const f of facts) {
      console.log(`   • ${f.category}/${f.key}: ${f.value} (importance: ${f.importance})`);
    }

    const semantics = await db.query.semanticMemories.findMany({
      where: eq(semanticMemories.userId, user.id),
    });
    console.log(`\n📦 语义记忆（共 ${semantics.length} 条）：`);
    for (const s of semantics) {
      const hasEmbedding = s.embedding && (s.embedding as number[]).length > 0;
      console.log(`   • "${s.content}" (embedding: ${hasEmbedding ? `✅ ${(s.embedding as number[]).length}维` : '❌ 无'})`);
    }

    console.log('\n🎉 Batch 3 验证完成！');
  } finally {
    console.log('\n--- 清理测试数据 ---\n');
    await cleanupTestUser(user.id, platform, platformId);
  }

  process.exit(0);
}

test().catch(console.error);
