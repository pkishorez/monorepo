// A fixture Auth Worker config for `auth generate` to introspect. It shares
// the model-shaping options with the real worker; runtime values are throwaway.
//
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { authModelOptions } from './src/worker/auth-model.ts';

export const auth = betterAuth({
  database: drizzleAdapter(drizzle.mock(), { provider: 'sqlite' }),
  ...authModelOptions({
    google: {
      clientId: 'auth-generate-fixture-client-id',
      clientSecret: 'auth-generate-fixture-client-secret',
    },
  }),
  baseURL: 'http://localhost:3000',
  secret: 'auth-generate-fixture-secret-auth-generate-fixture',
});
