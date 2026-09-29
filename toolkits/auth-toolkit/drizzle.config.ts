import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/auth-worker/database/sqlite/schema/schema.generated.ts',
  out: './src/auth-worker/database/sqlite/migration/migrations',
});
