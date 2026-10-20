import { generateKeyPairSync, verify } from 'node:crypto';
import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { GitHub } from './index.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
// As GitHub hands it out: PKCS#1, its newlines escaped on one line.
const pkcs1 = privateKey
  .export({ type: 'pkcs1', format: 'pem' })
  .toString()
  .replace(/\n/g, '\\n');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Whether `jwt` is an RS256 JWT of App 42 the test key signed. */
const signedByApp = (jwt: string) => {
  const [header, payload, signature] = jwt.split('.');
  const valid = verify(
    'RSA-SHA256',
    Buffer.from(`${header}.${payload}`),
    publicKey,
    Buffer.from(signature!, 'base64url'),
  );
  const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
  return valid && claims.iss === '42' && claims.exp - claims.iat <= 600;
};

const run = <A, E>(
  use: (github: GitHub['Service']) => Effect.Effect<A, E>,
  fetch: (url: URL, init: RequestInit) => Response,
) =>
  Effect.runPromiseExit(
    Effect.flatMap(GitHub, use).pipe(
      Effect.provide(
        GitHub.layer(
          {
            appId: '42',
            slug: 'console-test',
            privateKey: pkcs1,
            clientId: 'Iv1.test',
            clientSecret: 'client-secret',
          },
          async (input, init) => fetch(new URL(String(input)), init ?? {}),
        ),
      ),
    ),
  );

const bearer = (init: RequestInit) =>
  (new Headers(init.headers).get('authorization') ?? '').replace(
    /^Bearer /,
    '',
  );

describe('GitHub', () => {
  it('signs the App JWT with a PKCS#1 key and mints an installation token once', async () => {
    let minted = 0;
    const exit = await run(
      (github) =>
        Effect.all([github.installationToken(7), github.installationToken(7)]),
      (url, init) => {
        expect(url.pathname).toBe('/app/installations/7/access_tokens');
        expect(signedByApp(bearer(init))).toBe(true);
        minted++;
        return json({
          token: 'ghs_test',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      },
    );
    expect(exit).toEqual(Exit.succeed(['ghs_test', 'ghs_test']));
    expect(minted).toBe(1);
  });

  it('lists every page of an installation’s repositories', async () => {
    const page = (n: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        full_name: `o/r${n}-${i}`,
        private: true,
        default_branch: 'main',
      }));
    const exit = await run(
      (github) => github.repositories(7),
      (url, init) => {
        if (url.pathname.endsWith('/access_tokens'))
          return json({
            token: 'ghs_test',
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          });
        expect(bearer(init)).toBe('ghs_test');
        const n = Number(url.searchParams.get('page'));
        return json({
          total_count: 130,
          repositories: page(n, n === 1 ? 100 : 30),
        });
      },
    );
    expect(Exit.isSuccess(exit) && exit.value.length).toBe(130);
  });

  it('reads a folder, and refuses a path that climbs out of the repository', async () => {
    const fetch = (url: URL) =>
      url.pathname.endsWith('/access_tokens')
        ? json({
            token: 'ghs_test',
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
          })
        : json([
            { name: 'apps', path: 'apps', type: 'dir' },
            { name: 'alchemy.run.ts', path: 'alchemy.run.ts', type: 'file' },
            { name: 'mod', path: 'mod', type: 'submodule' },
          ]);
    expect(
      await run(
        (github) =>
          github.listFolder({
            installationId: 7,
            repo: 'o/r',
            ref: 'main',
            path: '',
          }),
        fetch,
      ),
    ).toEqual(
      Exit.succeed([
        { name: 'apps', path: 'apps', type: 'dir' },
        { name: 'alchemy.run.ts', path: 'alchemy.run.ts', type: 'file' },
      ]),
    );
    const climbing = await run(
      (github) =>
        github.listFolder({
          installationId: 7,
          repo: 'o/r',
          ref: 'main',
          path: '../../x',
        }),
      fetch,
    );
    expect(Exit.isFailure(climbing)).toBe(true);
  });

  it('fails as not found for an installation GitHub doesn’t know', async () => {
    const exit = await run(
      (github) => github.installation(9),
      () => json({ message: 'Not Found' }, 404),
    );
    expect(exit._tag === 'Failure' && JSON.stringify(exit.cause)).toContain(
      'not-found',
    );
  });
});
