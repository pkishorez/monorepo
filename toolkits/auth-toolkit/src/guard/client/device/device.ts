import { Effect, Exit, Layer, Schedule } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { Memory } from '@kestack/std-toolkit/db/memory';
import { bearer, Unauthenticated } from '../../authz/middleware/index.js';
import {
  AccountLimitReached,
  Accounts,
  type AccountsLayer,
  AuthWorkerUnavailable,
  DeviceLoginFailed,
  type SignInOptions,
  TestSignInUnsupported,
} from '../accounts/index.js';
import { makeAccounts, signing } from '../engine/index.js';
import { authWorkerApi } from '../auth-worker-api/index.js';
import { ANSWER, deviceLogin, verificationUrl } from './device-login.js';
import { processTerminal, type Show, showIn } from './show.js';
import {
  deviceAccountsTable,
  makeSignInStore,
  type SignInStorage,
  snapshotOf,
  type Stored,
} from './sign-in-store.js';

export { deviceAccountsTable };

export interface DeviceOptions {
  /** The Auth Worker's own URL, or an Effect read at each call to it, for
   * a Device whose Auth Worker can move. */
  readonly url: string | Effect.Effect<string>;
  /** This program's name: the Device Login's client id, and how the Home
   * Page names this Device. */
  readonly app: string;
  /** This program's version, for the Home Page. */
  readonly version?: string;
  /** The Sign-in Store; in memory unless given. */
  readonly storage?: SignInStorage;
  /** How many Accounts may be signed in at once; 5 unless given. */
  readonly maxAccounts?: number;
  /** How `signIn` opens the Device Screen unless it says: `'prompt'`
   * (the default) or `'auto'`. */
  readonly open?: 'prompt' | 'auto';
  /** Shows a pending Device Login; prints to this terminal unless given. A
   * TV or phone app shows the code its own way. */
  readonly show?: Show;
}

const hostname = Effect.promise(() =>
  import('node:os').then(
    (os) => os.hostname(),
    () => undefined,
  ),
);

/** `<app>/<version> (<hostname>)`, so the Home Page can name the Sign-in. */
const userAgentOf = (app: string, version?: string, host?: string) =>
  `${app}${version ? `/${version}` : ''}${host ? ` (${host})` : ''}`;

const withAccount = (
  current: Stored,
  account: Stored['accounts'][number],
): Stored => ({
  accounts: [
    ...current.accounts.filter(({ user }) => user.id !== account.user.id),
    account,
  ],
  active: account.user.id,
});

const without = (current: Stored, userId: string): Stored => {
  const left = current.accounts.filter(({ user }) => user.id !== userId);
  return {
    accounts: left,
    active: left.some(({ user }) => user.id === current.active)
      ? current.active
      : (left[0]?.user.id ?? null),
  };
};

/**
 * `Accounts` for a Device, and the signing of every guarded call: provide
 * this one Layer to the program.
 *
 * Each Account keeps its own Sign-in token in the Sign-in Store; every
 * guarded RPC or HttpApi call carries the Active Account's as a bearer, and
 * one refused Unauthenticated checks again before failing. `signIn` is a
 * Device Login; a Test User sign-in (`test`) fails TestSignInUnsupported. Nothing is asked of the Auth Worker on start: the stored
 * Accounts are trusted until `check` or a refused call.
 */
export const device = ({
  url,
  app,
  version,
  storage,
  maxAccounts = 5,
  open = 'prompt',
  show = showIn(processTerminal()),
}: DeviceOptions): AccountsLayer =>
  Layer.unwrap(
    Effect.gen(function* () {
      const userAgent = userAgentOf(app, version, yield* hostname);
      const client = yield* HttpClient.HttpClient;
      const urlNow = typeof url === 'string' ? Effect.succeed(url) : url;
      /** The Auth Worker as it is now: its URL, and Device Login there. */
      const worker = Effect.gen(function* () {
        const at = yield* urlNow;
        const api = yield* authWorkerApi(at, { userAgent }).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
        );
        return { url: at, login: deviceLogin(api, app, at) };
      });
      /** Fails once the Auth Worker is no longer the one at `at`: a sign-in
       * begun there is dropped, never kept. */
      const moved = new DeviceLoginFailed({ reason: 'moved' });
      const stillAt = (at: string) =>
        Effect.flatMap(urlNow, (now) =>
          now === at ? Effect.void : Effect.fail(moved),
        );
      const movedFrom = (at: string) =>
        typeof url === 'string'
          ? Effect.never
          : stillAt(at).pipe(
              Effect.repeat(Schedule.spaced('1 second')),
              Effect.andThen(Effect.never),
            );
      const store = yield* makeSignInStore;
      const read = Effect.map(store.read, snapshotOf);

      const check = Effect.gen(function* () {
        const { accounts } = yield* store.read;
        const { login } = yield* worker;
        const answers = yield* Effect.forEach(
          accounts,
          ({ token }) => login.whoIs(token),
          { concurrency: 'unbounded' },
        );
        const alive = new Map(
          accounts.flatMap(({ token }, i) => {
            const user = answers[i];
            return user ? [[token, user] as const] : [];
          }),
        );
        // Only what was asked about can be dropped: an Account signed in
        // while the check was asking stays.
        const asked = new Set(accounts.map(({ token }) => token));
        return snapshotOf(
          yield* store.update((current) => {
            const accounts = current.accounts.flatMap((account) => {
              if (!asked.has(account.token)) return [account];
              const user = alive.get(account.token);
              return user ? [{ user, token: account.token }] : [];
            });
            const active = accounts.some(
              ({ user }) => user.id === current.active,
            )
              ? current.active
              : (accounts[0]?.user.id ?? null);
            return { accounts, active };
          }),
        );
      });

      const signIn = (options: SignInOptions) =>
        Effect.gen(function* () {
          if (options.test) {
            return yield* new TestSignInUnsupported({ client: 'Device' });
          }
          const { url, login } = yield* worker;
          /** `effect`, given up once the Auth Worker is no longer at `url`. */
          const there = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
            Effect.raceFirst(effect, movedFrom(url));
          const code = yield* there(login.requestCode);
          const awaitToken = Effect.scoped(
            Effect.gen(function* () {
              // Shown before the first poll, and put away once it ends.
              yield* Effect.forkScoped(
                show({
                  url: verificationUrl(url, code.user_code, options.account),
                  code: code.user_code,
                  open: options.open ?? open,
                }),
                { startImmediately: true },
              );
              return yield* there(login.awaitToken(code));
            }),
          );
          /** The Account `token` names, once it may be kept. */
          const named = (token: string) =>
            Effect.gen(function* () {
              const user = yield* there(
                login.whoIs(token).pipe(
                  Effect.retry({
                    while: (error) =>
                      error._tag === 'AuthWorkerUnavailable' &&
                      error.kind !== 'unreadable',
                    schedule: Schedule.spaced('1 second'),
                    times: 3,
                  }),
                ),
              ).pipe(
                Effect.flatMap((named) =>
                  named
                    ? Effect.succeed(named)
                    : Effect.fail(
                        new AuthWorkerUnavailable({ url, kind: 'unreadable' }),
                      ),
                ),
              );
              // A sign-in that outlived its Auth Worker touches nothing here.
              yield* stillAt(url);
              const current = yield* store.read;
              const previous = current.accounts.find(
                (account) => account.user.id === user.id,
              );
              if (!previous && current.accounts.length >= maxAccounts)
                return yield* new AccountLimitReached({ limit: maxAccounts });
              if (previous) yield* login.revoke(previous.token);
              // Revoking can take five seconds: the Auth Worker may move meanwhile.
              yield* stillAt(url);
              return user;
            });
          // A token never kept is never left signed in, however keeping it
          // ends: failed, moved, or interrupted from the moment it came. The
          // store keeps it uninterrupted, so a token kept is never revoked.
          return yield* Effect.uninterruptibleMask((restore) =>
            restore(awaitToken).pipe(
              Effect.flatMap((token) =>
                restore(named(token)).pipe(
                  Effect.flatMap((user) =>
                    store.update((latest) =>
                      withAccount(latest, { user, token }),
                    ),
                  ),
                  Effect.map(snapshotOf),
                  Effect.onExit((exit) =>
                    Exit.isSuccess(exit) ? Effect.void : login.revoke(token),
                  ),
                ),
              ),
            ),
          );
        });

      /** Revokes `tokens` at the Auth Worker, finding it included, for
       * five seconds at most; they are forgotten here either way. */
      const revokeAll = (tokens: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const { login } = yield* worker;
          yield* Effect.forEach(tokens, login.revoke, {
            concurrency: 'unbounded',
            discard: true,
          });
        }).pipe(Effect.timeout(ANSWER), Effect.ignore);

      const tokenOf = (userId: string) =>
        Effect.map(
          store.read,
          ({ accounts }) =>
            accounts.find(({ user }) => user.id === userId)?.token,
        );

      const made = yield* makeAccounts({
        source: {
          read: check,
          signIn,
          switchTo: (userId) =>
            Effect.map(
              store.update((current) =>
                current.accounts.some(({ user }) => user.id === userId)
                  ? { ...current, active: userId }
                  : current,
              ),
              snapshotOf,
            ),
          signOut: (userId) =>
            Effect.gen(function* () {
              const token = yield* tokenOf(userId);
              if (token) yield* revokeAll([token]);
              return snapshotOf(
                yield* store.update((current) => without(current, userId)),
              );
            }),
          signOutAll: Effect.gen(function* () {
            const { accounts } = yield* store.read;
            yield* revokeAll(accounts.map(({ token }) => token));
            return snapshotOf(
              yield* store.update(() => ({ accounts: [], active: null })),
            );
          }),
        },
        last: yield* read,
        checkOnStart: false,
      });

      const signature = store.read.pipe(
        Effect.flatMap(({ accounts, active }) => {
          const token = accounts.find(({ user }) => user.id === active)?.token;
          return token
            ? Effect.succeed(bearer(token))
            : Effect.fail(new Unauthenticated({ reason: 'Not signed in' }));
        }),
      );
      const scope = yield* Effect.scope;
      return Layer.mergeAll(
        Layer.succeed(Accounts, made.accounts),
        signing({
          signature,
          refused: 'Unauthenticated',
          // The refusal reaches the caller at once; the check runs beside
          // it, for five seconds at most.
          recheck: Effect.forkIn(
            made.accounts.check.pipe(Effect.timeout(ANSWER), Effect.ignore),
            scope,
          ),
        }),
      );
    }),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        FetchHttpClient.layer,
        storage ?? Memory.make(deviceAccountsTable).layer,
      ),
    ),
  );
