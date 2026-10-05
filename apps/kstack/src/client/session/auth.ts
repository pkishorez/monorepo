import { createAuthClient } from '@kstackz/auth-toolkit/clients/browser';

/** Signs the user in at the shared Auth Worker; its cookie covers kstack. */
export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV
    ? 'https://auth.kishore.computer'
    : 'https://auth.kishore.app',
});
