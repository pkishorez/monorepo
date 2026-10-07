// Proves native Ledger's sign-in against the local services, without the
// app: authorize with PKCE and state, the Test Sign-In, the code exchange,
// a /rpc call with the Access Token, refresh with rotation, a reused refresh
// token killing the chain, and revocation on Sign Out.
//
//   node --use-system-ca scripts/native-sign-in.ts
//
// Needs the sign-in service (`pnpm dev` in ~/CAREER/MINE/mine/packages/auth)
// and Ledger web (`pnpm dev` here). LEDGER_URL defaults to this worktree's
// portless address; REDIRECT_URI to Expo Go's on the Simulator.
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { LedgerApi } from '@ledger/core/api';

const AUTH_URL = process.env.AUTH_URL ?? 'https://auth.kishore.computer';
const RESOURCE = 'https://kstack.kishore.computer/rpc';
const CLIENT_ID = 'ledger';
const REDIRECT_URI =
  process.env.REDIRECT_URI ?? 'exp://127.0.0.1:8081/--/oauth/callback';
const branch = execSync('git branch --show-current').toString().trim();
const LEDGER_URL =
  process.env.LEDGER_URL ?? `https://${branch}.kstack.kishore.computer`;
const api = `${AUTH_URL}/api/auth`;

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const form = (path: string, body: Record<string, string>) =>
  fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const signIn = async (email: string): Promise<Tokens> => {
  const verifier = `${randomUUID()}${randomUUID()}`;
  const state = randomUUID();
  const authorize = new URL(`${api}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    resource: RESOURCE,
    prompt: 'login',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString();
  // A browser navigating gets a 302; a fetch, the same redirect as JSON.
  const toLogin = await fetch(authorize, { redirect: 'manual' });
  const location =
    toLogin.headers.get('location') ??
    ((await toLogin.json()) as { url?: string }).url ??
    '';
  const login = new URL(location, AUTH_URL);
  check(
    login.pathname === '/login',
    `authorize sends ${email} to the Login Screen`,
  );

  const signedIn = await fetch(`${api}/sign-in/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: AUTH_URL },
    body: JSON.stringify({ email, oauth_query: login.search.slice(1) }),
  });
  const { url } = (await signedIn.json()) as { url?: string };
  const back = new URL(url ?? 'about:blank');
  check(
    url?.startsWith(`${REDIRECT_URI}?`) === true,
    `the Test Sign-In continues, with no consent, to ${REDIRECT_URI}`,
  );
  check(back.searchParams.get('state') === state, 'state comes back unchanged');

  const exchanged = await form('/oauth2/token', {
    grant_type: 'authorization_code',
    code: back.searchParams.get('code') ?? '',
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    resource: RESOURCE,
  });
  const tokens = (await exchanged.json()) as Tokens;
  check(
    exchanged.ok && !!tokens.refresh_token,
    'the code buys tokens with PKCE',
  );
  check(
    tokens.expires_in === 900,
    `the Access Token lives ${tokens.expires_in}s`,
  );
  return tokens;
};

const refresh = (refreshToken: string) =>
  form('/oauth2/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    resource: RESOURCE,
  });

/** One Ledger API call, signed with `token`; its result or its error tag. */
const callLedger = (token: string | null) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(LedgerApi);
      return yield* client['Accounts.Changes']({ after: null });
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(
          RpcClient.layerProtocolHttp({ url: `${LEDGER_URL}/rpc` }).pipe(
            Layer.provide([
              FetchHttpClient.layer,
              RpcSerialization.layerNdjson,
            ]),
          ),
          Authz.bearer(() => token),
        ),
      ),
      Effect.map((accounts) => ({ ok: true as const, accounts })),
      Effect.catch((error: { _tag?: string }) =>
        Effect.succeed({ ok: false as const, tag: error._tag }),
      ),
    ),
  );

console.log(`sign-in service ${AUTH_URL}, Ledger ${LEDGER_URL}\n`);

const first = await signIn('ada@ledger.test');
const called = await callLedger(first.access_token);
check(
  called.ok,
  `/rpc answers the Access Token (${called.ok ? `${called.accounts.length} accounts` : called.tag})`,
);
const anonymous = await callLedger('not-a-token');
check(
  !anonymous.ok && anonymous.tag === 'Unauthenticated',
  '/rpc refuses a made-up token',
);

const rotated = await refresh(first.refresh_token);
const second = (await rotated.json()) as Tokens;
check(
  rotated.ok && second.refresh_token !== first.refresh_token,
  'refreshing turns the refresh token over',
);
const calledAgain = await callLedger(second.access_token);
check(calledAgain.ok, '/rpc answers the refreshed Access Token');

const reused = await refresh(first.refresh_token);
check(reused.status === 400, 'the spent refresh token is refused');
const afterReuse = await refresh(second.refresh_token);
check(afterReuse.status === 400, 'its reuse revoked the whole chain');

const third = await signIn('ada@ledger.test');
const revoked = await form('/oauth2/revoke', {
  token: third.refresh_token,
  token_type_hint: 'refresh_token',
  client_id: CLIENT_ID,
});
check(revoked.ok, 'Sign Out revokes the refresh token');
check(
  (await refresh(third.refresh_token)).status === 400,
  'a revoked refresh token is refused',
);

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
