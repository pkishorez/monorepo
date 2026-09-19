// A fixture Auth Worker config for `auth generate` to introspect. It is the
// superset of every plugin the toolkit supports, so the Migration Recipe is
// role-independent; runtime values are throwaway.
//
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import {
  authModelOptions,
  authorizationServerOptions,
} from './src/worker/auth-model.ts';

const identity = authModelOptions({
  google: {
    clientId: 'auth-generate-fixture-client-id',
    clientSecret: 'auth-generate-fixture-client-secret',
  },
});
const authorizationServer = authorizationServerOptions({
  resources: [],
});

export const auth = betterAuth({
  database: drizzleAdapter(drizzle.mock(), { provider: 'sqlite' }),
  ...identity,
  plugins: [
    ...(identity.plugins ?? []),
    ...(authorizationServer.plugins ?? []),
  ],
  baseURL: 'http://localhost:3000',
  secret: 'auth-generate-fixture-secret-auth-generate-fixture',
});
