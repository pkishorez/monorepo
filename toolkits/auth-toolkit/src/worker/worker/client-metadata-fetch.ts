import type { ClientMetadataResourceFetch } from '@better-auth/oauth-provider';

// workerd rejects the plugin's `redirect: 'error'`; with `manual` the 3xx
// answer is returned and the plugin refuses every non-200 status.
export const workerClientMetadataFetch: ClientMetadataResourceFetch = (
  input,
  init,
) => fetch(input, { ...init, redirect: 'manual' });
