import { config } from 'dotenv';
config({ path: './packages/core/.env.local' });

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/core/src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CORE_DATABASE_URL!,
  },
});
