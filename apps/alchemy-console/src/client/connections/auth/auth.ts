import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV
    ? 'https://auth.kishore.computer'
    : 'https://auth.kishore.app',
});
