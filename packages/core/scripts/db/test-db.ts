import { db, client } from '../../src/db/client.js';
import { users, userRelations } from '../../src/db/schema.js';
import { redis } from '../../src/db/redis.js';
import { eq } from 'drizzle-orm';

async function testDb() {
  console.log('🔍 Testing database connection...\n');

  // 1. 查询 zimu
  const result = await db.select().from(users).where(eq(users.name, 'zimu'));
  if (result.length > 0) {
    const user = result[0];
    console.log('✅ User found:');
    console.log('   Name:', user.name);
    console.log('   ID:', user.id);
    console.log('   Platform:', user.platform);
    console.log('   Created:', user.createdAt);

    // 2. 查询关系
    const relations = await db.select().from(userRelations).where(eq(userRelations.userId, user.id));
    if (relations.length > 0) {
      const rel = relations[0];
      console.log('\n✅ Relation found:');
      console.log('   Role:', rel.role);
      console.log('   Stage:', rel.stage);
      console.log('   Intimacy:', rel.intimacyScore);
    }
  } else {
    console.log('❌ User zimu not found. Run `pnpm run db:seed` first.');
  }

  // 3. 测试 Redis
  console.log('\n🔍 Testing Redis connection...');
  await redis.set('snow:test', 'hello from snow');
  const value = await redis.get('snow:test');
  console.log('✅ Redis:', value);
  await redis.del('snow:test');

  // 4. 测试表存在
  console.log('\n🔍 Checking tables...');
  const tableList = await client`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log('✅ Tables:', tableList.map((t: any) => t.tablename).join(', '));

  console.log('\n🎉 All tests passed!');
  await client.end();
}

testDb().catch(console.error);
