/**
 * 测试用工具：创建和清理临时测试用户
 * 所有验证脚本应使用此工具，避免污染真实数据
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import {
  users,
  userRelations,
  factualMemories,
  semanticMemories,
  conversations,
  personalityCustomizations,
  personalityAdjustments,
} from '../src/db/schema.js';

const TEST_PLATFORM = '__test__';

/**
 * 创建一个临时测试用户（含关系记录）
 * platformId 会加 __test__ 前缀避免和真实用户冲突
 */
export async function createTestUser(name: string = 'test_user') {
  const platformId = `${TEST_PLATFORM}_${name}_${Date.now()}`;

  const [user] = await db.insert(users)
    .values({
      platformId,
      platform: TEST_PLATFORM,
      name,
    })
    .returning();

  const [relation] = await db.insert(userRelations)
    .values({
      userId: user.id,
      role: 'user',
      stage: 'stranger',
      intimacyScore: 10,
    })
    .returning();

  console.log(`🧪 创建测试用户: ${name} (${user.id})`);

  return { user, relation };
}

/**
 * 清理测试用户及其所有关联数据
 * 按外键依赖顺序删除
 */
export async function cleanupTestUser(userId: string) {
  const df = await db.delete(factualMemories).where(eq(factualMemories.userId, userId)).returning({ id: factualMemories.id });
  const ds = await db.delete(semanticMemories).where(eq(semanticMemories.userId, userId)).returning({ id: semanticMemories.id });
  const dc = await db.delete(conversations).where(eq(conversations.userId, userId)).returning({ id: conversations.id });
  await db.delete(personalityAdjustments).where(eq(personalityAdjustments.userId, userId));
  await db.delete(personalityCustomizations).where(eq(personalityCustomizations.userId, userId));
  const dr = await db.delete(userRelations).where(eq(userRelations.userId, userId)).returning({ id: userRelations.id });
  const du = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });

  console.log(`🗑️  已清理测试用户: ${df.length} 事实 + ${ds.length} 语义 + ${dc.length} 对话 + ${dr.length} 关系 + ${du.length} 用户`);
}
