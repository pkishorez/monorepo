import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import type { Outbound, TestApp } from './console.ts';

/*
 * GitHub as the tests' Worker reaches it: one App, whose installations a
 * test adds and changes, answering only a JWT the App's key signed, or a
 * token it minted, as GitHub answers. Deliveries are signed with the App's
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

export const fakeGitHub = () => {
  const installations = new Map<number, FakeInstallation>();
  const created = new Map<number, number>();
  const tokenOf = (id: number) => `ghs_installation_${id}`;

  const outbound: Outbound = (request) => {
    const url = new URL(request.url);
    if (url.host !== 'api.github.com')
      throw new TypeError(`The tests reach no ${url.host}.`);
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
