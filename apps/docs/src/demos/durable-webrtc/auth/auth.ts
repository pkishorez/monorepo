import { createAuthClient } from 'auth-toolkit/client';

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
});
