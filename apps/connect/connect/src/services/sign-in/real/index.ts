import { Context, Effect, Layer } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import { device } from '@kestack/auth-toolkit/client/device';
import { Store } from '../../store/contract/index.js';
import { SignIn, SignInFailed, type User } from '../contract/index.js';
import { authInfo } from './auth-info.js';

const APP = 'ke-connect';
const DISCOVERY = '5 seconds';
const CHECKING = '5 seconds';

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

const failed = (cause: unknown) =>
  new SignInFailed({ message: messageOf(cause) });

const activeOf = (state: AccountsState): User | null =>
  state._tag === 'SignedIn'
    ? { id: state.active.id, email: state.active.email }
    : null;

export interface SignInOptions {
  readonly cloud: string;
  readonly version: string;
}

export const layer = (options: SignInOptions) =>
  Layer.effect(
    SignIn,
    Effect.gen(function* () {
      const store = yield* Store;
      let current: string | null = null;

      const discover = authInfo(options.cloud).pipe(
        Effect.timeoutOrElse({
          duration: DISCOVERY,
          orElse: () =>
            Effect.fail(
              new Error(
                `${options.cloud} did not say how to sign in in ${DISCOVERY}`,
              ),
            ),
        }),
        Effect.tap((info) =>
          store
            .keepAuthWorker({ cloud: options.cloud, url: info.url })
            .pipe(Effect.ignore),
        ),
        Effect.map((info) => info.url),
        Effect.catch((error) =>
          Effect.flatMap(
            store
              .authWorker(options.cloud)
              .pipe(Effect.orElseSucceed(() => null)),
            (kept) =>
              kept === null
                ? Effect.fail(error)
                : Effect.as(
                    Effect.logWarning(
                      `${error.message}; signing in as last time, through ${kept.url}`,
                    ),
                    kept.url,
                  ),
          ),
        ),
        Effect.tap((url) =>
          Effect.sync(() => {
            current = url;
          }),
        ),
        Effect.mapError(failed),
      );

      const context = yield* Layer.build(
        device({
          url: Effect.sync(() => current ?? options.cloud),
          app: APP,
          version: options.version,
          storage: store.signInTable,
          maxAccounts: 1,
        }),
      );
      const accounts = Context.get(context, Accounts);

      const fresh = Effect.gen(function* () {
        yield* Effect.log(`Sign in to ${options.cloud} through ${current}`);
        yield* accounts.signIn();
        const user = activeOf(yield* accounts.current);
        if (user === null)
          return yield* new SignInFailed({
            message: 'Signing in did not finish',
          });
        return user;
      }).pipe(
        Effect.catch((cause) =>
          Effect.fail(cause instanceof SignInFailed ? cause : failed(cause)),
        ),
      );

      return SignIn.of({
        saved: Effect.gen(function* () {
          yield* discover;
          const checked = yield* accounts.check.pipe(
            Effect.timeout(CHECKING),
            Effect.catch(() => accounts.current),
          );
          return activeOf(checked);
        }).pipe(
          Effect.catch((cause) =>
            Effect.fail(cause instanceof SignInFailed ? cause : failed(cause)),
          ),
        ),
        signIn: Effect.andThen(discover, fresh),
        signInAgain: Effect.gen(function* () {
          yield* discover;
          yield* Effect.ignore(accounts.signOutAll);
          return yield* fresh;
        }),
        signOut: Effect.ignore(accounts.signOutAll),
        signing: Layer.succeedContext(context) as Layer.Layer<unknown>,
      });
    }),
  );
