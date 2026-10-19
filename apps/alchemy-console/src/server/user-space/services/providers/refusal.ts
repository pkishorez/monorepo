import { Effect } from 'effect';
import {
  CredentialError,
  type CredentialField,
} from '../../../../shared/contracts/credential/index.ts';

/*
 * How a provider's answer becomes the error under a form field. A provider's
 * own words are kept, since they name the failure best, but only after every
 * secret sent with the request is cut out of them.
 */

export type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const LIMIT = 300;

/** `text` with every one of `secrets` cut out, on one line, and short. */
export const masked = (text: string, secrets: ReadonlyArray<string>) => {
  let clean = text;
  for (const secret of secrets.filter((secret) => secret.length >= 4))
    clean = clean.split(secret).join('••••');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.length > LIMIT ? `${clean.slice(0, LIMIT)}…` : clean;
};

export const refused = (field: CredentialField | null, message: string) =>
  new CredentialError({ reason: 'rejected', field, message });

/** Sends `request`, failing as unreachable when no answer comes. */
export const send = (
  fetch: Fetch,
  request: Request,
  unreachable: {
    readonly field: CredentialField | null;
    readonly message: string;
  },
) =>
  Effect.tryPromise({
    try: () => fetch(request),
    catch: () => new CredentialError({ reason: 'unreachable', ...unreachable }),
  });

/** The body as JSON, or null when it is not. */
export const jsonOf = (response: Response) =>
  Effect.promise(() => response.json().catch(() => null as unknown));
