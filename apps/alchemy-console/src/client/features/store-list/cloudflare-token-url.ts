// https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/
export const adminPermissions = [
  ['workers_scripts', 'Workers Scripts', 'edit'],
  ['secrets_store', 'Secrets Store', 'edit'],
  ['workers_kv_storage', 'Workers KV Storage', 'edit'],
  ['workers_r2', 'Workers R2 Storage', 'edit'],
  ['d1', 'D1', 'edit'],
  ['queues', 'Queues', 'edit'],
  ['page', 'Pages', 'edit'],
  ['stream', 'Stream', 'edit'],
  ['images', 'Images', 'edit'],
  ['logs', 'Logs', 'edit'],
  ['account_api_tokens', 'Account API Tokens', 'edit'],
  ['account_settings', 'Account Settings', 'edit'],
  ['workers_routes', 'Workers Routes (zones)', 'edit'],
  ['dns', 'DNS (zones)', 'edit'],
  ['zone', 'Zone', 'edit'],
  ['zone_settings', 'Zone Settings', 'edit'],
  ['firewall_services', 'Firewall Services', 'edit'],
  ['page_rules', 'Page Rules', 'edit'],
  ['ssl_and_certificates', 'SSL and Certificates', 'edit'],
  ['access', 'Access Applications', 'edit'],
  ['access_acct', 'Access Organizations', 'edit'],
  ['access_custom_page', 'Access Custom Pages', 'edit'],
  ['teams', 'Zero Trust', 'edit'],
  ['cache', 'Cache', 'purge'],
  ['account_analytics', 'Account Analytics', 'read'],
  ['analytics', 'Zone Analytics', 'read'],
  ['access_audit_log', 'Access Audit Logs', 'read'],
  ['billing', 'Billing', 'read'],
] as const;

export function cloudflareTokenUrl(
  accountId: string,
  access: 'view' | 'admin' = 'view',
) {
  const account = accountId.trim();
  if (!/^[a-f0-9]{32}$/i.test(account)) return null;
  const url = new URL('https://dash.cloudflare.com/profile/api-tokens');
  url.search = new URLSearchParams({
    name: `Alchemy Console — ${access === 'admin' ? 'Admin' : 'View access'}`,
    accountId: account,
    zoneId: 'all',
    permissionGroupKeys: JSON.stringify(
      access === 'admin'
        ? adminPermissions.map(([key, , type]) => ({ key, type }))
        : [
            { key: 'workers_scripts', type: 'edit' },
            { key: 'secrets_store', type: 'edit' },
          ],
    ),
  }).toString();
  return url.href;
}
