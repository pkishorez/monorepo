import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import type { NewCredential } from '../../../../shared/contracts/credential/index.ts';
import { Providers } from './index.ts';

const ACCOUNT = 'd81fbf7c729395fbe59316b1e4b09493';
const TOKEN = 'good-token-0123456789';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** Cloudflare's API as the fake sees it: the good token reads the account. */
const cloudflare = (request: Request) => {
  const url = new URL(request.url);
  const token = request.headers.get('authorization');
  if (token !== `Bearer ${TOKEN}`)
    return json(400, {
      success: false,
      errors: [{ code: 1000, message: 'Invalid API Token' }],
    });
  if (url.pathname === `/client/v4/accounts/${ACCOUNT}/workers/subdomain`)
    return json(200, {
      success: true,
      errors: [],
      result: { subdomain: 'sb' },
    });
  if (url.pathname === `/client/v4/accounts/${ACCOUNT}`)
    return json(200, {
      success: true,
      errors: [],
      result: { id: ACCOUNT, name: 'Sandbox Account' },
    });
  return json(404, {
    success: false,
    errors: [{ code: 7003, message: 'Could not route to /accounts/x' }],
  });
};

const verify = (
  input: NewCredential,
  fetch: (request: Request) => Response | Promise<Response>,
) =>
  Effect.runPromiseExit(
    Effect.flatMap(Providers, (providers) => providers.verify(input)).pipe(
      Effect.provide(
        Providers.layer((input, init) =>
          Promise.resolve(fetch(new Request(input, init))),
        ),
      ),
    ),
  );

const failureOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;

const errorOf = (exit: Exit.Exit<unknown, unknown>) => {
  const reason = failureOf(exit) as { readonly error?: unknown } | undefined;
  return reason?.error as
    | { field: string | null; message: string; reason: string }
    | undefined;
};

const cf = (apiToken: string, accountId = ACCOUNT): NewCredential => ({
  provider: 'cloudflare',
  name: 'Sandbox',
  secret: { accountId, apiToken },
});

describe('Providers.verify for Cloudflare', () => {
  it('confirms the account and reads its name', async () => {
    const exit = await verify(cf(TOKEN), cloudflare);
    expect(exit).toEqual(
      Exit.succeed({
        accountId: ACCOUNT,
        accountName: 'Sandbox Account',
        region: null,
      }),
    );
  });

  it('blames the token Cloudflare refuses, in its own words, never echoing it', async () => {
    const error = errorOf(await verify(cf('wrong-token'), cloudflare));
    expect(error?.field).toBe('apiToken');
    expect(error?.reason).toBe('rejected');
    expect(error?.message).toContain('Invalid API Token');
    expect(error?.message).not.toContain('wrong-token');
  });

  it('blames the account ID when Cloudflare knows no such account', async () => {
    const error = errorOf(await verify(cf(TOKEN, 'a'.repeat(32)), cloudflare));
    expect(error?.field).toBe('accountId');
  });

  it('accepts an account that has not registered its workers.dev subdomain', async () => {
    const exit = await verify(cf(TOKEN), (request) =>
      new URL(request.url).pathname.endsWith('/workers/subdomain')
        ? json(404, {
            success: false,
            errors: [{ code: 10007, message: 'workers.api.error.not_found' }],
          })
        : cloudflare(request),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it('says Cloudflare could not be reached', async () => {
    const error = errorOf(
      await verify(cf(TOKEN), () => Promise.reject(new TypeError('offline'))),
    );
    expect(error?.reason).toBe('unreachable');
  });
});

const aws = (accessKeyId: string, region = 'eu-west-1'): NewCredential => ({
  provider: 'aws',
  name: 'Prod AWS',
  secret: { accessKeyId, secretAccessKey: 'shh-secret' },
  region,
});

/** STS as the fake sees it: only AKIAGOOD's signed request is known. */
const sts = (request: Request) => {
  const url = new URL(request.url);
  if (url.host !== 'sts.eu-west-1.amazonaws.com')
    return Promise.reject(new TypeError('getaddrinfo ENOTFOUND'));
  const signed = request.headers.get('authorization') ?? '';
  return signed.includes('Credential=AKIAGOODKEY000000/')
    ? json(200, {
        GetCallerIdentityResponse: {
          GetCallerIdentityResult: {
            Account: '123456789012',
            Arn: 'arn:aws:iam::123456789012:user/deployer',
            UserId: 'AIDA',
          },
        },
      })
    : json(403, {
        Error: {
          Code: 'InvalidClientTokenId',
          Message: 'The security token included in the request is invalid.',
        },
      });
};

describe('Providers.verify for AWS', () => {
  it('confirms the account in the region given', async () => {
    const exit = await verify(aws('AKIAGOODKEY000000'), sts);
    expect(exit).toEqual(
      Exit.succeed({
        accountId: '123456789012',
        accountName: null,
        region: 'eu-west-1',
      }),
    );
  });

  it('blames the access key ID AWS does not know', async () => {
    const error = errorOf(await verify(aws('AKIABADKEY0000000'), sts));
    expect(error?.field).toBe('accessKeyId');
    expect(error?.message).toContain('InvalidClientTokenId');
  });

  it('blames a region with no STS endpoint', async () => {
    const error = errorOf(
      await verify(aws('AKIAGOODKEY000000', 'xx-nowhere-9'), sts),
    );
    expect(error?.field).toBe('region');
  });
});
