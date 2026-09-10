import { createAuthClient } from 'auth-toolkit/client';
import { authUrlFor } from '../../shared/auth/index.ts';

// Direct Session Check: the browser talks to the Auth Worker itself.
// During SSR there is no session to check, so the URL only matters in the browser.
export const authClient = createAuthClient({
  baseURL: authUrlFor(
    typeof window === 'undefined' ? '' : window.location.hostname,
  ),
});
