import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import * as schema from './schema';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
config({ path: envPath });

const connectionString = process.env.CORE_DATABASE_URL;

if (!connectionString) {
  throw new Error('CORE_DATABASE_URL is not set');
}

// 创建 postgres 连接（适合 Serverless 的配置）
const client = postgres(connectionString, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Drizzle 实例
export const db = drizzle(client, { schema });

// 导出 client 以便需要时关闭连接
export { client };
