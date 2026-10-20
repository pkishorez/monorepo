import {
  createHash,
  createHmac,
  generateKeyPairSync,
  verify,
} from 'node:crypto';
import type { Outbound, TestApp } from './console.ts';

/*
 * GitHub as the tests' Worker reaches it: one App, whose installations a
 * test adds and changes, answering only a JWT the App's key signed, or a
 * token it minted, as GitHub answers. A GitHub user is an OAuth code a test
 * hands out: a login, and the organizations it is an owner or a plain
 * member of. Deliveries are signed with the App's
 * webhook secret, as GitHub signs them.
 */

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

export const APP: TestApp = {
  id: '5385708',
  slug: 'alchemy-console-test',
  privateKey: privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  webhookSecret: 'webhook-secret-for-tests',
  clientId: 'Iv1.testclient',
  clientSecret: 'client-secret-for-tests',
};

export interface FakeInstallation {
  readonly id: number;
  readonly login: string;
  readonly type: 'User' | 'Organization';
  repositories: Array<string>;
  /** When it was installed; now unless said. */
  readonly createdAt?: number;
  /** A folder listing for each `owner/name/path`. */
  readonly folders?: Record<
    string,
    Array<{ name: string; path: string; type: string }>
  >;
}

export interface GitHubUser {
  readonly login: string;
  /** Organizations it is an owner of. */
  readonly owns?: ReadonlyArray<string>;
  /** Organizations it is only a member of. */
  readonly memberOf?: ReadonlyArray<string>;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const signedByApp = (jwt: string) => {
  const [header, payload, signature] = jwt.split('.');
  if (!header || !payload || !signature) return false;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return (
    claims.iss === APP.id &&
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    )
  );
};

/** The head commit the fake GitHub gives `ref`: a SHA is its own head. */
export const headOf = (ref: string) =>
  /^[0-9a-f]{40}$/.test(ref)
    ? ref
    : createHash('sha1').update(ref).digest('hex');

export const fakeGitHub = () => {
  const installations = new Map<number, FakeInstallation>();
  const created = new Map<number, number>();
  const tokenOf = (id: number) => `ghs_installation_${id}`;
  const users = new Map<string, GitHubUser>();
  /** While true, GitHub's API answers 502, as when it is down. */
  let down = false;

  const outbound: Outbound = async (request) => {
    const url = new URL(request.url);
    if (
      url.host === 'github.com' &&
      url.pathname === '/login/oauth/access_token'
    ) {
      const body = JSON.parse(await request.text());
      if (
        body.client_id !== APP.clientId ||
        body.client_secret !== APP.clientSecret
      )
        return json(200, { error: 'incorrect_client_credentials' });
      return users.has(body.code)
        ? json(200, { access_token: `ghu_${body.code}` })
        : json(200, { error: 'bad_verification_code' });
    }
    if (url.host !== 'api.github.com')
      throw new TypeError(`The tests reach no ${url.host}.`);
    if (down) return json(502, { message: 'Server Error' });
    const bearer = (request.headers.get('authorization') ?? '').replace(
      /^Bearer /,
      '',
    );
    const asApp = url.pathname.match(
      /^\/app\/installations\/([0-9]+)(\/access_tokens)?$/,
    );
    if (asApp) {
      if (!signedByApp(bearer))
        return json(401, { message: 'A JSON web token could not be decoded' });
      const installation = installations.get(Number(asApp[1]));
      if (installation === undefined)
        return json(404, { message: 'Not Found' });
      if (asApp[2])
        return json(201, {
          token: tokenOf(installation.id),
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      return json(200, {
        id: installation.id,
        account: {
          login: installation.login,
          type: installation.type,
          avatar_url: `https://avatars.githubusercontent.com/${installation.login}`,
        },
        created_at: new Date(
          installation.createdAt ?? created.get(installation.id)!,
        ).toISOString(),
      });
    }
    if (bearer.startsWith('ghu_')) {
      const user = users.get(bearer.replace(/^ghu_/, ''));
      if (user === undefined) return json(401, { message: 'Bad credentials' });
      if (url.pathname === '/user') return json(200, { login: user.login });
      const org = url.pathname.match(/^\/user\/memberships\/orgs\/([^/]+)$/);
      if (org) {
        const name = decodeURIComponent(org[1]!);
        if (user.owns?.includes(name))
          return json(200, { state: 'active', role: 'admin' });
        if (user.memberOf?.includes(name))
          return json(200, { state: 'active', role: 'member' });
        return json(404, { message: 'Not Found' });
      }
      return json(403, { message: 'Resource not accessible by integration' });
    }
    const installation = [...installations.values()].find(
      (each) => tokenOf(each.id) === bearer,
    );
    if (installation === undefined)
      return json(401, { message: 'Bad credentials' });
    if (url.pathname === '/installation/repositories')
      return json(200, {
        total_count: installation.repositories.length,
        repositories: installation.repositories.map((full_name) => ({
          full_name,
          private: true,
          default_branch: 'main',
        })),
      });
    const commit = url.pathname.match(
      /^\/repos\/([^/]+\/[^/]+)\/commits\/(.+)$/,
    );
    if (commit && installation.repositories.includes(commit[1]!))
      return json(200, {
        sha: headOf(decodeURIComponent(commit[2]!)),
        html_url: `https://github.com/${commit[1]}/commit/${headOf(commit[2]!)}`,
        commit: { message: 'A commit', author: null },
      });
    const contents = url.pathname.match(
      /^\/repos\/([^/]+\/[^/]+)\/contents\/?(.*)$/,
    );
    if (contents && installation.repositories.includes(contents[1]!)) {
      const listing =
        installation.folders?.[
          `${contents[1]}/${decodeURIComponent(contents[2]!)}`
        ];
      return listing ? json(200, listing) : json(404, { message: 'Not Found' });
    }
    return json(404, { message: 'Not Found' });
  };

  return {
    outbound,
    /** Installs the App, as GitHub would before sending the visitor back. */
    install: (installation: FakeInstallation) => {
      installations.set(installation.id, installation);
      created.set(installation.id, Date.now());
      return installation;
    },
    uninstall: (id: number) => installations.delete(id),
    /** A GitHub user signing in: the code GitHub hands back for them. */
    user: (user: GitHubUser) => {
      const code = `code-${users.size + 1}`;
      users.set(code, user);
      return code;
    },
    /** Takes GitHub's API down, or brings it back. */
    setDown: (value: boolean) => {
      down = value;
    },
  };
};

/** A delivery of `event` with `payload`, signed with `secret`, as `fetch` init and headers. */
export const delivery = (
  event: string,
  payload: unknown,
  secret = APP.webhookSecret,
) => {
  const body = JSON.stringify(payload);
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    },
  };
};
