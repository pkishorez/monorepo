import { createAuthClient as createBetterAuthClient } from 'better-auth/react';

interface AuthClientConfig {
  /** The Auth Worker's own deployed URL. */
  baseURL: string;
}

export const createAuthClient = (config: AuthClientConfig) => {
  const client = createBetterAuthClient({
    baseURL: config.baseURL,
    fetchOptions: { credentials: 'include' },
  });

  return {
    useSession: client.useSession,
    signIn: {
      google: (callbackURL?: string) =>
        client.signIn.social({ provider: 'google', callbackURL }),
    },
    signOut: () => client.signOut(),
  };
};
