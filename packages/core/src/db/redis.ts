import { config } from 'dotenv';
import { Redis } from '@upstash/redis';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env.local');
config({ path: envPath });

const url = process.env.CORE_UPSTASH_REDIS_REST_URL;
const token = process.env.CORE_UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error('CORE_UPSTASH_REDIS_REST_URL or CORE_UPSTASH_REDIS_REST_TOKEN is not set');
}

export const redis = new Redis({ url, token });
