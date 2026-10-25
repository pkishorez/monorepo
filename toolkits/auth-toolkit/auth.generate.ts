// A fixture Auth Worker config for `auth generate` to introspect. It is the
// superset of every plugin the toolkit supports, so the Migration Recipe is
// role-independent; runtime values are throwaway.
//
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { authorizationServerOptions } from './src/worker/service/authorization-server/authorization-server.ts';
import { identityOptions } from './src/worker/service/identity/identity.ts';

const identity = identityOptions({
  google: {
    clientId: 'auth-generate-fixture-client-id',
    clientSecret: 'auth-generate-fixture-client-secret',
  },
});
const authorizationServer = authorizationServerOptions({
  resources: [],
  scopes: [],
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
