// https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/
export function cloudflareTokenUrl(accountId: string) {
  const account = accountId.trim();
  if (!/^[a-f0-9]{32}$/i.test(account)) return null;
  const url = new URL('https://dash.cloudflare.com/profile/api-tokens');
  url.search = new URLSearchParams({
    name: 'Alchemy Console',
    accountId: account,
    zoneId: 'all',
    permissionGroupKeys: JSON.stringify([
      { key: 'workers_scripts', type: 'edit' },
      { key: 'secrets_store', type: 'edit' },
    ]),
  }).toString();
  return url.href;
}
