import { createAuthClient } from '@kstackz/auth-toolkit/clients/browser';

export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV
    ? 'https://auth.kishore.computer'
    : 'https://auth.kishore.app',
});
