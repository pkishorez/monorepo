// https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/
export type TokenAccess = 'read' | 'write';

// Discovery reads the state-store token through a preview Worker, so even
// browsing needs Edit on Workers Scripts and Secrets Store.
export const readPermissions = [
  ['workers_scripts', 'Workers Scripts', 'edit'],
  ['secrets_store', 'Secrets Store', 'edit'],
] as const;

// The products the console deletes through Alchemy, plus zone reads for
// verifying resource ownership. Hyperdrive has no template key; add it by hand.
export const writePermissions = [
  ...readPermissions,
  ['workers_kv_storage', 'Workers KV Storage', 'edit'],
  ['workers_r2', 'Workers R2 Storage', 'edit'],
  ['d1', 'D1', 'edit'],
  ['queues', 'Queues', 'edit'],
  ['zone', 'Zone (zones)', 'read'],
  ['dns', 'DNS (zones)', 'edit'],
  ['workers_routes', 'Workers Routes (zones)', 'edit'],
] as const;

// Forces the account picker; the chosen account's ID then appears in the URL
// and under "Account details" on the landing page.
export const cloudflareAccountUrl =
  'https://dash.cloudflare.com/?to=/:account/workers-and-pages';

export function cloudflareTokenUrl(
  accountId: string,
  access: TokenAccess = 'read',
) {
  const account = accountId.trim();
  if (!/^[a-f0-9]{32}$/i.test(account)) return null;
  const permissions = access === 'write' ? writePermissions : readPermissions;
  const url = new URL('https://dash.cloudflare.com/profile/api-tokens');
  url.search = new URLSearchParams({
    name: `Alchemy Console — ${access === 'write' ? 'Write' : 'Read'}`,
    accountId: account,
    zoneId: 'all',
    permissionGroupKeys: JSON.stringify(
      permissions.map(([key, , type]) => ({ key, type })),
    ),
  }).toString();
  return url.href;
}
