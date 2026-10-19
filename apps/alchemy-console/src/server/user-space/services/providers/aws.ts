import { AwsClient } from 'aws4fetch';
import { Effect } from 'effect';
import type { CredentialField } from '../../../../shared/contracts/credential/index.ts';
import { type Fetch, jsonOf, masked, refused, send } from './refusal.ts';

/*
 * AWS confirms keys by STS GetCallerIdentity, asked of the STS endpoint in
 * the region the user named, so a mistyped region shows here, not at the
 * first deploy.
 */

type Identity = {
  readonly GetCallerIdentityResponse?: {
    readonly GetCallerIdentityResult?: { readonly Account?: unknown };
  };
  readonly Error?: { readonly Code?: unknown; readonly Message?: unknown };
};

/** Which field each STS refusal is about. */
const BLAME: Record<string, CredentialField> = {
  InvalidClientTokenId: 'accessKeyId',
  SignatureDoesNotMatch: 'secretAccessKey',
  IncompleteSignature: 'secretAccessKey',
  ExpiredToken: 'sessionToken',
  InvalidToken: 'sessionToken',
};

/** The account `secret` belongs to, confirmed in `region`. */
export const verifyAws = (
  fetch: Fetch,
  secret: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly sessionToken?: string | undefined;
  },
  region: string,
) =>
  Effect.gen(function* () {
    const where = region.trim();
    const sessionToken = secret.sessionToken?.trim() || undefined;
    const client = new AwsClient({
      accessKeyId: secret.accessKeyId.trim(),
      secretAccessKey: secret.secretAccessKey.trim(),
      ...(sessionToken ? { sessionToken } : {}),
      service: 'sts',
      region: where,
    });
    const request = yield* Effect.promise(() =>
      client.sign(`https://sts.${where}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: 'Action=GetCallerIdentity&Version=2011-06-15',
      }),
    );
    const response = yield* send(fetch, request, {
      field: 'region',
      message: `Couldn’t reach AWS in ${where}. Check the region code, then try again.`,
    });
    const body = (yield* jsonOf(response)) as Identity | null;
    const account =
      body?.GetCallerIdentityResponse?.GetCallerIdentityResult?.Account;
    if (response.ok && typeof account === 'string')
      return { accountId: account, accountName: null, region: where };

    const code = typeof body?.Error?.Code === 'string' ? body.Error.Code : '';
    const message =
      typeof body?.Error?.Message === 'string' ? body.Error.Message : '';
    const words = masked(
      [code, message].filter((word) => word.length > 0).join(': '),
      [secret.secretAccessKey, sessionToken ?? ''],
    );
    return yield* refused(
      BLAME[code] ?? null,
      `AWS refused these keys${words ? `: ${words}` : ` (HTTP ${response.status})`}.`,
    );
  });
