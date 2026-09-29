import type { D1Database } from '@cloudflare/workers-types';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { drizzle } from 'drizzle-orm/d1';
import { authRelations, authSchema } from '../../schema/index.js';

export const d1PrimaryDatabase = (
  binding: D1Database,
): ReturnType<typeof drizzleAdapter> => {
  const db = drizzle(binding, { relations: authRelations });
  return drizzleAdapter(db, { provider: 'sqlite', schema: authSchema });
};
