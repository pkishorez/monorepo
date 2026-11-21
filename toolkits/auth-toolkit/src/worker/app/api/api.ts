import { Context, Data, Effect, Layer } from 'effect';
import type { AccountList } from './schemas.ts';

/*
 * The pages' one way out: the Auth Worker's `/api/auth` endpoints, called
 * from the browser with this browser's cookies for what the visitor does,
 * and leaving the page. What a page shows arrives with it, from its Loader.
 * No answer carries a token.
 */

const BASE = '/api/auth';

/** An endpoint's `{ error, message }`, or a request that never got one. */
export class ApiError extends Data.TaggedError('ApiError')<{
  readonly status: number;
  readonly code: string;
  readonly message: string;
}> {}

const OFFLINE = new ApiError({
  status: 0,
  code: 'network',
  message: "Couldn't reach the server. Check your connection and try again.",
});

export interface GoogleSignIn {
  /** Where Google's answer lands; better-auth's OAuth continuation when absent. */
  readonly returnTo?: string | undefined;
  /** Where a failed sign-in lands, with `error` and `error_description`. */
  readonly errorTo: string;
  /** Asks Google to offer this account first. */
  readonly loginHint?: string | undefined;
  /** The signed query of an OAuth authorization this sign-in continues. */
  readonly oauthQuery?: string | undefined;
}

export class Api extends Context.Service<
  Api,
  {
    readonly accounts: Effect.Effect<AccountList, ApiError>;
    readonly switchTo: (
      userId: string,
    ) => Effect.Effect<{ readonly active: string }, ApiError>;
    readonly signOut: (
      userId: string,
    ) => Effect.Effect<{ readonly active: string | null }, ApiError>;
    readonly signOutAll: Effect.Effect<void, ApiError>;
    /** Each change to the lists names `userId`, the Account they are
     * for; one that is no longer active fails `account_changed`. */
    readonly revokeSignIn: (
      id: string,
      userId: string,
    ) => Effect.Effect<void, ApiError>;
    readonly revokeOtherSignIns: (
      userId: string,
    ) => Effect.Effect<number, ApiError>;
    readonly revokeGrant: (
      id: string,
      userId: string,
    ) => Effect.Effect<void, ApiError>;
    readonly deviceAnswer: (answer: {
      readonly userCode: string;
      readonly userId: string;
      readonly approve: boolean;
    }) => Effect.Effect<'approved' | 'denied', ApiError>;
    /** The URL to go to next: back to the OAuth Client. */
    readonly consentAnswer: (answer: {
      readonly query: string;
      readonly userId: string;
      readonly accept: boolean;
    }) => Effect.Effect<string, ApiError>;
    /** Google's URL for this sign-in. */
    readonly google: (sign: GoogleSignIn) => Effect.Effect<string, ApiError>;
    /** The page's own address, query included. */
    readonly location: Effect.Effect<{
      readonly pathname: string;
      readonly search: string;
      readonly origin: string;
    }>;
    /** Leaves the page for a URL. */
    readonly leave: (url: string) => Effect.Effect<void>;
    /** Says each time the page is shown again, as after another tab. */
    readonly onShown: (listener: () => void) => () => void;
  }
>()('@kestack/auth-toolkit/pages/Api') {}

const request = <A>(path: string, init?: { body: unknown }) =>
  Effect.tryPromise({
    try: async (signal) => {
      const response = await fetch(`${BASE}${path}`, {
        method: init ? 'POST' : 'GET',
        credentials: 'same-origin',
        signal,
        headers: init
          ? { 'content-type': 'application/json', accept: 'application/json' }
          : { accept: 'application/json' },
        ...(init ? { body: JSON.stringify(init.body) } : {}),
      });
      const body = (await response.json().catch(() => null)) as
        | (A & { error?: string; message?: string; code?: string })
        | null;
      if (!response.ok) {
        throw new ApiError({
          status: response.status,
          code: body?.error ?? body?.code?.toLowerCase() ?? 'failed',
          message:
            body?.message ??
            `The server answered ${response.status}. Try again in a moment.`,
        });
      }
      return body as A;
    },
    catch: (cause) => (cause instanceof ApiError ? cause : OFFLINE),
  });

const get = <A>(path: string) => request<A>(path);
const post = <A>(path: string, body: unknown = {}) =>
  request<A>(path, { body });

/** The Api over `fetch` and `window`, for the browser. */
export const apiLive = Layer.succeed(Api, {
  accounts: get<AccountList>('/accounts'),
  switchTo: (userId) => post('/accounts/switch', { userId }),
  signOut: (userId) => post('/accounts/sign-out', { userId }),
  signOutAll: post('/sign-out').pipe(Effect.asVoid),
  revokeSignIn: (id, userId) =>
    post('/sign-ins/revoke', { id, userId }).pipe(Effect.asVoid),
  revokeOtherSignIns: (userId) =>
    post<{ revoked: number }>('/sign-ins/revoke-others', { userId }).pipe(
      Effect.map((body) => body.revoked),
    ),
  revokeGrant: (id, userId) =>
    post('/grants/revoke', { id, userId }).pipe(Effect.asVoid),
  deviceAnswer: (answer) =>
    post<{ status: 'approved' | 'denied' }>('/device/answer', answer).pipe(
      Effect.map((body) => body.status),
    ),
  consentAnswer: (answer) =>
    post<{ url: string }>('/consent/answer', answer).pipe(
      Effect.map((body) => body.url),
    ),
  google: (sign) =>
    post<{ url?: string }>('/sign-in/social', {
      provider: 'google',
      errorCallbackURL: sign.errorTo,
      ...(sign.returnTo ? { callbackURL: sign.returnTo } : {}),
      ...(sign.loginHint ? { loginHint: sign.loginHint } : {}),
      ...(sign.oauthQuery ? { oauth_query: sign.oauthQuery } : {}),
    }).pipe(
      Effect.flatMap((body) =>
        body.url
          ? Effect.succeed(body.url)
          : Effect.fail(
              new ApiError({
                status: 500,
                code: 'no_redirect',
                message: "Google didn't answer. Try again in a moment.",
              }),
            ),
      ),
    ),
  location: Effect.sync(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
    origin: window.location.origin,
  })),
  leave: (url) => Effect.sync(() => window.location.assign(url)),
  onShown: (listener) => {
    const shown = () => {
      if (document.visibilityState === 'visible') listener();
    };
    document.addEventListener('visibilitychange', shown);
    return () => document.removeEventListener('visibilitychange', shown);
  },
});
