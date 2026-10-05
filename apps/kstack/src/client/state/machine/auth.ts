import { createAuthClient } from '@kstackz/auth-toolkit/clients/browser';

/** The shared sign-in service, for this stage. */
export const AUTH_URL = import.meta.env.DEV
  ? 'https://auth.kishore.computer'
  : 'https://auth.kishore.app';

/** Signs Users in at the shared sign-in service; its cookie covers kstack. */
export const authClient = createAuthClient({ baseURL: AUTH_URL });
