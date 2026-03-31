import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { db, client } from '../src/db/client.js';
import { users, userRelations } from '../src/db/schema.js';

async function seed() {
  console.log('🌱 Seeding database...\n');

  // 创建或查找 zimu 用户
  let [zimu] = await db.insert(users).values({
    platformId: 'zimu',
    platform: 'system',
    name: 'zimu',
  }).onConflictDoNothing().returning();

  if (zimu) {
    console.log('✅ User created:', zimu.name, '(', zimu.id, ')');
  } else {
    zimu = (await db.query.users.findFirst({ where: eq(users.platformId, 'zimu') }))!;
    console.log('ℹ️  User zimu already exists:', zimu.id);
  }

  // 确保关系数据存在
  const existingRelation = await db.query.userRelations.findFirst({
    where: eq(userRelations.userId, zimu.id),
  });

  if (existingRelation) {
    console.log(`ℹ️  Relation exists: ${existingRelation.role} / ${existingRelation.stage} / ${existingRelation.intimacyScore}`);
  } else {
    await db.insert(userRelations).values({
      userId: zimu.id,
      role: 'owner',
      stage: 'intimate',
      intimacyScore: 100,
    });
    console.log('✅ Relation created: owner / intimate / 100');
  }

  console.log('\n🌱 Seed complete!');
  await client.end();
}

seed().catch(console.error);
