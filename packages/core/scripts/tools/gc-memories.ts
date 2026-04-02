/**
 * 记忆垃圾回收脚本
 * 清理鲜活度极低的语义记忆（彻底遗忘）
 * 建议每周运行一次
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { gcAllMemories } from '../../src/memory/gc.js';

async function main() {
  console.log('🧹 开始记忆垃圾回收...\n');

  const results = await gcAllMemories();

  if (results.size === 0) {
    console.log('   没有语义记忆需要处理。');
  } else {
    for (const [userId, result] of results) {
      console.log(`   用户 ${userId.slice(0, 8)}...:`);
      console.log(`     扫描 ${result.scanned} 条，删除 ${result.deleted} 条，保护 ${result.protected} 条`);
    }
  }

  console.log('\n🧹 垃圾回收完成！');
  process.exit(0);
}

main().catch(console.error);
