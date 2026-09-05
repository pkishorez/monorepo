// A fixture Auth Worker config for `auth generate` to introspect. It shares
// the model-shaping options with the real worker; runtime values are throwaway.
//
import { betterAuth } from 'better-auth';
import { authModelOptions } from './src/worker/auth-model.ts';

export const auth = betterAuth({
  ...authModelOptions({
    google: {
      clientId: 'auth-generate-fixture-client-id',
      clientSecret: 'auth-generate-fixture-client-secret',
    },
  }),
  baseURL: 'http://localhost:3000',
  secret: 'auth-generate-fixture-secret-auth-generate-fixture',
});
