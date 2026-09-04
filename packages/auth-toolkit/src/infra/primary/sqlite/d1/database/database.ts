import type { D1Database } from '@cloudflare/workers-types';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { authSchema } from '../../schema/index.js';

export const d1PrimaryDatabase = (binding: D1Database) => {
  const db = drizzle(binding, { schema: authSchema });
  return drizzleAdapter(db, { provider: 'sqlite', schema: authSchema });
};
