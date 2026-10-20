import { makeSignature } from 'better-auth/crypto';
import { handler } from '@kestack/kabuki/start/server';
import { describe, expect, it } from 'vitest';
import { memory } from '../../database/sqlite/memory/index.js';
import {
  baseURL,
  config,
  cookies,
  postAsProgram,
  secret,
  signIn,
} from '../../worker/tests/fixture.js';
import { makeAuthWorker } from '../../worker/worker.js';
import app from '../app.tsx';
import server from '../loaders.server.ts';

/*
 * The pages drawn by the Auth Worker itself, from source: every page
 * arrives with its data in the first drawing, read from the request's
 * cookies, and no drawing or Loader answer ever carries a token.
 */

const pages = handler({
  app,
  server,
  build: {
    id: undefined,
    base: '/',
    entry: { script: '/assets/entry.js', styles: [], preloads: [] },
    views: {},
    head: [],
  },
});

const make = () =>
  makeAuthWorker(
    {
      ...config,
      database: memory(),
      oauth: {
        resources: {
          'https://api.example.com': { 'notes:read': 'Read your notes' },
        },
      },
    },
    {
      assets: {},
      fetch: (request, context) => pages.fetch(request, { env: context }),
    },
  );

type Worker = ReturnType<typeof make>;

const page = async (worker: Worker, path: string, cookie = '') => {
  const response = await worker.handler(
    new Request(`${baseURL}${path}`, { headers: cookie ? { cookie } : {} }),
  );
  return { response, html: await response.text() };
};

/** The page's saved History: what the browser hydrates and carries on from. */
const saved = (html: string) =>
  /<script type="application\/json" id="kabuki-start">(.*?)<\/script>/s.exec(
    html,
  )![1]!;

const twoAccounts = async (worker: Worker) => {
  const ada = await signIn(worker, 'ada@example.com');
  const mary = await signIn(worker, 'mary@example.com');
  // Somewhere else Mary is signed in too.
  const laptop = await signIn(
    worker,
    'mary@example.com',
    'acme-cli/1.4.0 (mary-mbp)',
  );
  return {
    ada,
    mary,
    laptop,
    tokens: [ada.token, mary.token, laptop.token],
    cookie: cookies(mary.active, ada.account, mary.account),
  };
};

const grant = async (worker: Worker, userId: string) => {
  const { adapter } = await worker.auth.$context;
  await adapter.create({
    model: 'oauthClient',
    data: {
      clientId: 'notes-mcp',
      name: 'Claude',
      redirectUris: ['https://claude.ai/callback'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  await adapter.create({
    model: 'oauthConsent',
    data: {
      clientId: 'notes-mcp',
      userId,
      scopes: ['openid', 'notes:read'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
};

describe('the Home Page', () => {
  it('arrives with the Accounts, Sign-ins and Grants, and no token', async () => {
    const worker = make();
    const { mary, tokens, cookie } = await twoAccounts(worker);
    await grant(worker, mary.user.id);
    const { response, html } = await page(worker, '/', cookie);
    expect(response.status).toBe(200);
    // Drawn: the Account, both Sign-ins and the app, with no skeleton.
    expect(html).toContain('mary@example.com');
    expect(html).toContain('You&#x27;re using it now');
    expect(html).toContain('acme-cli on mary-mbp');
    expect(html).toContain('Remove access for Claude');
    expect(html).not.toContain('aria-busy="true"');
    // And saved for the browser to carry on from, every Account in it.
    expect(saved(html)).toContain('ada@example.com');
    for (const token of tokens) expect(html).not.toContain(token);
  });

  it('sends a signed-out visitor to the Login Screen', async () => {
    const { response } = await page(make(), '/');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toMatch(/^\/login/);
  });

  it('answers the browser’s moves with the same data, and no token', async () => {
    const worker = make();
    const { tokens, cookie } = await twoAccounts(worker);
    const response = await worker.handler(
      new Request(`${baseURL}/_kabuki/load`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ places: [{ name: 'Home', params: {} }] }),
      }),
    );
    const text = await response.text();
    expect(text).toContain('"Loaded"');
    expect(text).toContain('acme-cli on mary-mbp');
    for (const token of tokens) expect(text).not.toContain(token);
  });
});

describe('the Device Screen', () => {
  it('arrives with the code looked up, unclaimed', async () => {
    const worker = make();
    const { ada, tokens, cookie } = await twoAccounts(worker);
    const { user_code } = (await (
      await postAsProgram(worker, '/device/code', { client_id: 'acme-cli' })
    ).json()) as { user_code: string };
    const { html } = await page(
      worker,
      `/device?code=${user_code}&account=ada@example.com`,
      cookie,
    );
    expect(html).toContain('Sign in to acme-cli?');
    // The hinted Account is picked, though Mary is active.
    expect(html).toContain(`checked="" value="${ada.user.id}"`);
    for (const token of tokens) expect(html).not.toContain(token);
    const { adapter } = await worker.auth.$context;
    const record = await adapter.findOne<{ userId: string | null }>({
      model: 'deviceCode',
      where: [{ field: 'userCode', value: user_code }],
    });
    expect(record?.userId ?? null).toBeNull();
  });

  it('says what is wrong with a code that matches nothing', async () => {
    const worker = make();
    const { cookie } = await twoAccounts(worker);
    const { html } = await page(worker, '/device?code=NOPE1234', cookie);
    expect(html).toContain('doesn&#x27;t match a sign-in');
  });
});

describe('the Login Screen', () => {
  it('sends a signed-in visitor back where return_to says', async () => {
    const worker = make();
    const { cookie } = await twoAccounts(worker);
    const { response } = await page(worker, '/login?return_to=/device', cookie);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${baseURL}/device`);
  });

  it('stays to add another Account', async () => {
    const worker = make();
    const { cookie } = await twoAccounts(worker);
    const { response, html } = await page(
      worker,
      '/login?add_account=1',
      cookie,
    );
    expect(response.status).toBe(200);
    expect(html).toContain('Add another account');
  });
});

/** An authorization's signed query, as oauth-provider sends the browser on with it. */
const signedQuery = async (clientId: string) => {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: 'https://claude.ai/callback',
    scope: 'openid notes:read',
    state: 'state-1',
    exp: `${Math.floor(Date.now() / 1000) + 3600}`,
  });
  for (const name of [...new Set([...params.keys(), 'ba_param'])].sort())
    params.append('ba_param', name);
  const canonical = new URLSearchParams(
    [...params.entries()].sort(([a, x], [b, y]) =>
      a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0,
    ),
  );
  params.append('sig', await makeSignature(canonical.toString(), secret));
  return params.toString();
};

/** The Loader RPC, as a browser's move asks it: no Referer, the place's params alone. */
const load = async (
  worker: Worker,
  cookie: string,
  place: { readonly name: string; readonly params: object },
) => {
  const response = await worker.handler(
    new Request(`${baseURL}/_kabuki/load`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ places: [place] }),
    }),
  );
  return response.text();
};

describe('a signed authorization, carried by its place', () => {
  it('the Consent Screen’s Loader reads the request from its params', async () => {
    const worker = make();
    const { mary, cookie } = await twoAccounts(worker);
    await grant(worker, mary.user.id);
    const search = await signedQuery('notes-mcp');
    const text = await load(worker, cookie, {
      name: 'Consent',
      params: { search },
    });
    expect(text).toContain('"Found"');
    expect(text).toContain('Claude');
  });

  it('the Login Screen it continues to names the app', async () => {
    const worker = make();
    const { mary } = await twoAccounts(worker);
    await grant(worker, mary.user.id);
    const search = await signedQuery('notes-mcp');
    const text = await load(worker, '', {
      name: 'Login',
      params: { search, client_id: 'notes-mcp' },
    });
    expect(text).toContain('"continuing":"Claude"');
  });
});

describe('the Consent Screen', () => {
  it('says a request without a valid signature cannot be answered', async () => {
    const worker = make();
    const { cookie } = await twoAccounts(worker);
    const { html } = await page(worker, '/consent?client_id=x', cookie);
    expect(html).toContain('This request can&#x27;t be answered');
  });
});
