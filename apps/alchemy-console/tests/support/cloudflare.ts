import type { Outbound } from './console.ts';

/*
 * Cloudflare's API as the tests' Worker reaches it: one account, which one
 * token may read, answering as Cloudflare answers.
 */

export const SANDBOX = {
  accountId: 'd81fbf7c729395fbe59316b1e4b09493',
  accountName: 'Sandbox Account',
  apiToken: 'sandbox-token-5f1e2d3c4b5a69788796a5b4',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const fakeCloudflare: Outbound = (request) => {
  const url = new URL(request.url);
  if (url.host !== 'api.cloudflare.com')
    throw new TypeError(`The tests reach no ${url.host}.`);
  if (request.headers.get('authorization') !== `Bearer ${SANDBOX.apiToken}`)
    return json(400, {
      success: false,
      errors: [{ code: 1000, message: 'Invalid API Token' }],
    });
  const account = `/client/v4/accounts/${SANDBOX.accountId}`;
  if (url.pathname === `${account}/workers/subdomain`)
    return json(200, {
      success: true,
      errors: [],
      result: { subdomain: 'sb' },
    });
  if (url.pathname === account)
    return json(200, {
      success: true,
      errors: [],
      result: { id: SANDBOX.accountId, name: SANDBOX.accountName },
    });
  return json(404, {
    success: false,
    errors: [{ code: 7003, message: 'Could not route' }],
  });
};
