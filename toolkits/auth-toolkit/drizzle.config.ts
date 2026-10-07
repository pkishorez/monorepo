import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/database/sqlite/schema/schema.generated.ts',
  out: './src/worker/database/sqlite/migration/migrations',
});
