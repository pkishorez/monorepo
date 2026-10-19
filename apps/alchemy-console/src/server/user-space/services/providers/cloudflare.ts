import { Effect } from 'effect';
import { type Fetch, jsonOf, masked, refused, send } from './refusal.ts';

/*
 * Cloudflare confirms a token by letting it read the account's Workers
 * subdomain, which every deploy needs, and then the account's name, which
 * Settings shows beside the credential.
 */

const API = 'https://api.cloudflare.com/client/v4';

type Envelope = {
  readonly success?: boolean;
  readonly errors?: ReadonlyArray<{
    readonly code?: number;
    readonly message?: string;
  }>;
  readonly result?: { readonly name?: unknown };
};

const unreachable = {
  field: null,
  message: 'Couldn’t reach Cloudflare. Check your connection and try again.',
};

/** Cloudflare's own words for what went wrong, with codes. */
const said = (body: Envelope | null, secrets: ReadonlyArray<string>) => {
  const words = (body?.errors ?? [])
    .slice(0, 3)
    .map(({ code, message }) =>
      [message, code === undefined ? '' : `(code ${code})`].join(' ').trim(),
    )
    .filter((word) => word.length > 0)
    .join('; ');
  return words.length > 0 ? ` Cloudflare said: ${masked(words, secrets)}.` : '';
};

const noAccount = (status: number, body: Envelope | null) =>
  status === 404 ||
  (body?.errors ?? []).some(({ code }) => code === 7003 || code === 7000);

/** The account `apiToken` reaches, by ID, and its name. */
export const verifyCloudflare = (
  fetch: Fetch,
  secret: { readonly accountId: string; readonly apiToken: string },
) =>
  Effect.gen(function* () {
    const accountId = secret.accountId.trim().toLowerCase();
    const apiToken = secret.apiToken.trim();
    const secrets = [apiToken, secret.apiToken];
    const read = (path: string) =>
      Effect.gen(function* () {
        const response = yield* send(
          fetch,
          new Request(`${API}/accounts/${accountId}${path}`, {
            headers: { authorization: `Bearer ${apiToken}` },
          }),
          unreachable,
        );
        const body = (yield* jsonOf(response)) as Envelope | null;
        return {
          ok: response.ok && body?.success === true,
          status: response.status,
          body,
        };
      });

    const subdomain = yield* read('/workers/subdomain');
    // An account that has never registered its workers.dev subdomain says
    // so, which still proves the token reaches its Workers.
    const unregistered = (subdomain.body?.errors ?? []).some(
      ({ code }) => code === 10007,
    );
    if (!subdomain.ok && !unregistered) {
      const words = said(subdomain.body, secrets);
      if (noAccount(subdomain.status, subdomain.body))
        return yield* refused(
          'accountId',
          `Cloudflare found no account with this ID.${words}`,
        );
      return yield* subdomain.status === 400 || subdomain.status === 401
        ? refused(
            'apiToken',
            `Cloudflare didn’t accept this token. Check it was copied whole and hasn’t expired or been revoked.${words}`,
          )
        : refused(
            'apiToken',
            `Cloudflare didn’t let this token use Workers in this account. Check it was made for this account, with Workers Scripts permission.${words}`,
          );
    }

    const account = yield* read('');
    const name = account.body?.result?.name;
    if (!account.ok || typeof name !== 'string')
      return yield* refused(
        'apiToken',
        `This token can’t read the account’s name. Add Account Settings: Read to it.${said(account.body, secrets)}`,
      );
    return { accountId, accountName: name, region: null };
  });
