import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV
    ? 'https://auth.local.kishore.app'
    : 'https://auth.kishore.app',
});
