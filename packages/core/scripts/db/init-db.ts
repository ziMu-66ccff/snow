import { config } from 'dotenv';
config({ path: './packages/core/.env.local' });

import postgres from 'postgres';

const sql = postgres(process.env.CORE_DATABASE_URL!);

async function main() {
  try {
    await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✅ pgvector extension enabled');

    const extensions = await sql`SELECT extname FROM pg_extension`;
    const hasVector = extensions.some((e: any) => e.extname === 'vector');
    console.log('✅ pgvector verified:', hasVector);

    const result = await sql`SELECT NOW() as now`;
    console.log('✅ Database connected:', result[0].now);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await sql.end();
  }
}

main();
