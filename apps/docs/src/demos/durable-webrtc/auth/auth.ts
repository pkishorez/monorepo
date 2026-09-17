import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL:
    import.meta.env.DEV && typeof window !== 'undefined'
      ? window.location.origin
      : 'https://auth.kishore.app',
});
