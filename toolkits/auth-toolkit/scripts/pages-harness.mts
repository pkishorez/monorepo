// Serves the built Auth Worker, pages included, on http://auth.acme.localhost:8787
// over an in-memory database with two Accounts, a few Sign-ins, a Grant and
// a pending Device Login, to look at the pages in a browser.
//
//   pnpm build && node scripts/pages-harness.mts
//
//   /__harness/sign-in?as=ada|grace|both  sets this browser's cookies, then /
//                                          (or a list: as=ada,grace,alan)
//   /__harness/device                      a fresh Device Login code, then /device
//   /__harness/consent[?page=login]        a signed consent request, then /consent
//                                          (or the Login Screen continuing it)
//
// MAX_ACCOUNTS=3 caps the Accounts a browser holds, to see the menu at its limit.
// API_DELAY_MS=800 holds every answer but the assets that long: a page, the
// Loader RPC and /api/auth alike, to watch the pages on a slow network.
import { createServer } from 'node:http';
import { makeSignature } from 'better-auth/crypto';
import { authWorker } from '../dist/worker/app/worker.js';
import { memory } from '../dist/worker/database/memory/index.js';

const PORT = Number(process.env.PORT ?? 8787);
const DELAY = Number(process.env.API_DELAY_MS ?? 0);
const url = `http://auth.acme.localhost:${PORT}`;
const secret = 'harness-secret-harness-secret-harness';

const worker = authWorker({
  url,
  secret,
  google: { clientId: 'harness', clientSecret: 'harness' },
  database: memory(),
  cookieDomain: 'acme.localhost',
  ...(process.env.MAX_ACCOUNTS
    ? { maxAccounts: Number(process.env.MAX_ACCOUNTS) }
    : {}),
  brand: {
    name: 'Acme',
    ...(process.env.ACCENT ? { accent: process.env.ACCENT } : {}),
  },
  oauth: {
    resources: {
      'https://notes.acme.localhost': {
        'notes:read': 'Read your notes',
        'notes:write': 'Create and edit your notes',
      },
    },
  },
});

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FIREFOX_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

const context = await worker.auth.$context;
const people = {
  ada: { email: 'ada@acme.dev', name: 'Ada Lovelace' },
  grace: { email: 'grace@acme.dev', name: 'Grace Hopper' },
  alan: {
    email: 'alan.mathison.turing@cryptanalysis.bletchley-park.example',
    name: 'Alan Turing',
  },
};
const users: Record<string, { id: string }> = {};
for (const [key, person] of Object.entries(people)) {
  users[key] = await context.internalAdapter.createUser(
    { ...person, emailVerified: true },
    { method: 'email-password' },
  );
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);
const session = async (userId: string, userAgent: string, minutes = 0) => {
  const made = await context.internalAdapter.createSession(userId, false, {
    userAgent,
  });
  if (minutes > 0) {
    await context.adapter.update({
      model: 'session',
      where: [{ field: 'id', value: made.id }],
      update: { updatedAt: ago(minutes), createdAt: ago(minutes * 30) },
    });
  }
  return made;
};

// Somewhere else Ada is signed in: a Windows laptop, and her CLI.
await session(users.ada!.id, FIREFOX_WIN, 60 * 26);
await session(users.ada!.id, 'acme-cli/1.4.0 (ada-mbp)', 35);

// An app with access to Ada's notes.
await context.adapter.create({
  model: 'oauthClient',
  data: {
    clientId: 'notes-mcp',
    name: 'Claude',
    uri: 'https://claude.ai',
    redirectUris: ['https://claude.ai/callback'],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
});
await context.adapter.create({
  model: 'oauthConsent',
  data: {
    clientId: 'notes-mcp',
    userId: users.ada!.id,
    scopes: ['openid', 'profile', 'notes:read'],
    createdAt: ago(60 * 24 * 9),
    updatedAt: ago(60 * 24 * 9),
  },
});

const cookieName = context.authCookies.sessionToken.name;
const cookiesFor = async (keys: string[]) => {
  const set: string[] = [];
  for (const [index, key] of keys.entries()) {
    const made = await session(users[key]!.id, CHROME_MAC);
    const value = encodeURIComponent(
      `${made.token}.${await makeSignature(made.token, secret)}`,
    );
    set.push(
      `${cookieName}_multi-${made.token.toLowerCase()}=${value}; Path=/; Domain=acme.localhost; HttpOnly; SameSite=Lax`,
    );
    if (index === 0)
      set.push(
        `${cookieName}=${value}; Path=/; Domain=acme.localhost; HttpOnly; SameSite=Lax`,
      );
  }
  return set;
};

const signedConsent = async () => {
  const params = new URLSearchParams({
    client_id: 'notes-mcp',
    response_type: 'code',
    redirect_uri: 'https://claude.ai/callback',
    scope: 'openid profile email notes:read notes:write',
    state: 'harness',
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
  return `/consent?${params}`;
};

const harness = async (request: Request): Promise<Response | undefined> => {
  const at = new URL(request.url);
  if (at.pathname === '/__harness/sign-in') {
    const as = at.searchParams.get('as') ?? 'both';
    const keys = as === 'both' ? ['ada', 'grace'] : as.split(',');
    const headers = new Headers({
      location: at.searchParams.get('to') ?? '/',
    });
    for (const cookie of await cookiesFor(keys))
      headers.append('set-cookie', cookie);
    return new Response(null, { status: 302, headers });
  }
  if (at.pathname === '/__harness/device') {
    const response = await worker.handler(
      new Request(`${url}/api/auth/device/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: 'acme-cli' }),
      }),
    );
    const code = (await response.json()) as { user_code: string };
    const account = at.searchParams.get('account');
    const query = new URLSearchParams({ code: code.user_code });
    if (account) query.set('account', account);
    return new Response(null, {
      status: 302,
      headers: { location: `/device?${query}` },
    });
  }
  if (at.pathname === '/__harness/consent') {
    return new Response(null, {
      status: 302,
      headers: {
        location: (await signedConsent()).replace(
          '/consent',
          at.searchParams.get('page') === 'login' ? '/login' : '/consent',
        ),
      },
    });
  }
  return undefined;
};

createServer(async (incoming, outgoing) => {
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value))
      value.forEach((each) => headers.append(key, each));
    else if (value !== undefined) headers.set(key, value);
  }
  const request = new Request(`${url}${incoming.url}`, {
    method: incoming.method,
    headers,
    ...(chunks.length > 0 ? { body: Buffer.concat(chunks) } : {}),
  });
  try {
    if (DELAY > 0 && !new URL(request.url).pathname.startsWith('/assets/'))
      await new Promise((resolve) => setTimeout(resolve, DELAY));
    const response =
      (await harness(request)) ?? (await worker.handler(request));
    const out: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      if (key !== 'set-cookie') out[key] = value;
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) out['set-cookie'] = cookies;
    outgoing.writeHead(response.status, out);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end(String(error));
  }
}).listen(PORT, () =>
  console.log(
    `pages harness on ${url}${DELAY > 0 ? `, every answer held ${DELAY}ms` : ''}`,
  ),
);
