import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/database/schema/schema.generated.ts',
  out: './src/worker/database/migration/migrations',
});
