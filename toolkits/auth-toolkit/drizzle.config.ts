import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/infra/primary/sqlite/schema/schema.generated.ts',
  out: './src/infra/primary/sqlite/migration/migrations',
});
