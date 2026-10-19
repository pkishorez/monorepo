/*
 * Cloudflare's prefilled API token form, with every permission an Alchemy
 * deploy of a typical app needs, and Account Settings: Read, so Console can
 * show the account's name. Hyperdrive and other products have no template
 * key; a user who needs them adds them by hand.
 * https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/
 */

const PERMISSIONS = [
  ['account_settings', 'read'],
  ['workers_scripts', 'edit'],
  ['secrets_store', 'edit'],
  ['workers_kv_storage', 'edit'],
  ['workers_r2', 'edit'],
  ['d1', 'edit'],
  ['queues', 'edit'],
  ['zone', 'read'],
  ['dns', 'edit'],
  ['workers_routes', 'edit'],
] as const;

/** Where an account's ID shows: the dashboard asks which account, then puts its ID in the URL. */
export const ACCOUNT_ID_URL =
  'https://dash.cloudflare.com/?to=/:account/workers-and-pages';

/** The token form, for the account `accountId` names once it is a whole ID. */
export const cloudflareTokenUrl = (accountId: string) => {
  const account = accountId.trim();
  const url = new URL('https://dash.cloudflare.com/profile/api-tokens');
  url.search = new URLSearchParams({
    name: 'Alchemy Console',
    ...(/^[a-f0-9]{32}$/i.test(account) ? { accountId: account } : {}),
    zoneId: 'all',
    permissionGroupKeys: JSON.stringify(
      PERMISSIONS.map(([key, type]) => ({ key, type })),
    ),
  }).toString();
  return url.href;
};
