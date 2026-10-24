import { Context, Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { type ReactNode, useSyncExternalStore } from 'react';
import {
  type Account,
  Accounts,
  type AccountsState,
} from '@kestack/auth-toolkit/client';
import {
  fakeAccounts,
  fakeAccountsTable,
  fakeGuard,
} from '@kestack/auth-toolkit/fake';
import { Sync, type SyncStore } from '@kestack/std-toolkit/sync';
import {
  type ApiClients,
  type Apis,
  cloudProtocol,
  type LocalBackends,
  localProtocol,
} from '../apis/index.ts';
import { createGate, gateReact, type GateView } from '../gate/index.ts';
import type { AccountsLayer, Backend, Host, Storage } from '../host/index.ts';
import {
  defineSession,
  keepSyncs,
  type Opened,
  OpenSessionProvider,
  openSession,
  type SessionDef,
  useOpenedOrNone,
} from '../session/index.ts';
import { publicClients } from './public.ts';

/** What an app with auth gives: what one Account keeps while it is
 * active. Without a Session, `SignedIn` still works and every API is still
 * signed; there is just nothing of the app's own to keep. */
export interface AuthConfig<A extends Apis, S> {
  readonly session?: SessionDef<A, S>;
}

/** What an app gives `createApp`, each part switching on only what needs
 * it. */
export interface AppConfig<A extends Apis, S, C> {
  /** Where the app runs, made the first time anything asks. */
  readonly host: () => Host;
  /** The app's APIs, by name. */
  readonly apis?: A;
  /** The Local Backend: every API's handlers, run in the app on the
   * device's own Storage, or what loads them the first time it is chosen.
   * Who signed a call is read from its Local Token, so the handlers need
   * nothing of auth's. Without it, the app has only the cloud Backend. */
  readonly local?: (
    storage: Storage,
  ) => LocalBackends<A> | Promise<LocalBackends<A>>;
  /** Signing in: several Accounts on this device, one open at a time, each
   * with its own Session. Without it, the app has no Accounts. */
  readonly auth?: AuthConfig<A, S>;
  /** What only this device keeps and belongs to no user, such as Settings,
   * opened on first use. */
  readonly cache?: (storage: Storage) => C;
}

type NotOpen<S> = Exclude<GateView<S>, { kind: 'open' }>;

/** What signs every guarded call as the Active Account. */
type Signing = Layer.Success<AccountsLayer>;

/** What runs while the app is on one Backend: how a Session reaches each
 * API, where its Std Sync is kept, and what deletes signed-out users'. */
class Link extends Context.Service<
  Link,
  {
    /** Each API's protocol for a Session. */
    readonly protocols: () => Readonly<
      Record<string, Layer.Layer<RpcClient.Protocol>>
    >;
    readonly store: SyncStore;
    readonly keep: (userIds: ReadonlyArray<string>) => Effect.Effect<void>;
  }
>()('@kestack/web-platform/app/Link') {}

const activeId = (state: AccountsState) =>
  state._tag === 'SignedIn'
    ? state.active.id
    : state._tag === 'Checking'
      ? state.last?.id
      : undefined;

/**
 * `protocol` sending every call as `account` alone, whatever the Accounts'
 * signing, which signs as the Active Account of the moment, put on it:
 * `expect-user` always names `account`, so the cloud refuses the call
 * Account Changed once the cookie is another's; and a bearer goes only while
 * `account` is still the Active Account, so the Local Backend refuses it
 * Unauthenticated after. What a Session leaves behind an Account Switch, its
 * Std Sync's last writes or a call still waiting, never lands as the next
 * Account.
 */
export const sendingAs = (
  protocol: Layer.Layer<RpcClient.Protocol>,
  account: Account,
  accounts: Accounts['Service'],
): Layer.Layer<RpcClient.Protocol> =>
  Layer.effect(
    RpcClient.Protocol,
    Effect.gen(function* () {
      const inner = yield* RpcClient.Protocol;
      return {
        ...inner,
        send: (clientId, request, transferables) =>
          request._tag !== 'Request'
            ? inner.send(clientId, request, transferables)
            : Effect.flatMap(accounts.current, (state) => {
                const active = activeId(state) === account.id;
                const headers = request.headers.flatMap(
                  ([name, value]): Array<[string, string]> =>
                    name === 'expect-user'
                      ? [[name, account.id]]
                      : name === 'authorization' && !active
                        ? []
                        : [[name, value]],
                );
                return inner.send(
                  clientId,
                  { ...request, headers },
                  transferables,
                );
              }),
      };
    }),
  ).pipe(Layer.provideMerge(protocol));

/** An app's parts with no Accounts: its APIs and its cache. */
const makeCore = <A extends Apis, C>(
  config: Pick<AppConfig<A, unknown, C>, 'host' | 'apis' | 'local' | 'cache'>,
) => {
  let made: Host | undefined;
  const host = () => (made ??= config.host());
  const apis = (config.apis ?? {}) as A;
  const names = Object.keys(apis);

  // A guarded call is signed with the Accounts' signing; a public one goes
  // out signed as nobody.
  const cloudProtocols = (signed: boolean) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        cloudProtocol(apis[name]!, host().cloud.url, { signed }),
      ]),
    );
  // The Local Backend's handlers, each behind auth-toolkit's fake guard,
  // which reads who signed a call from its Local Token. Loaded the first
  // time it is chosen.
  let loaded:
    | Promise<Record<string, Layer.Layer<RpcClient.Protocol>>>
    | undefined;
  const localProtocols = () =>
    (loaded ??= (async () => {
      const handlers = await config.local!(host().storage);
      const guard = fakeGuard.rpc();
      return Object.fromEntries(
        names.map((name) => [
          name,
          localProtocol(
            apis[name]!,
            Layer.merge(guard, handlers[name] as never) as never,
          ),
        ]),
      );
    })());
  const protocolOf = async (backend: Backend, name: string) =>
    backend === 'local'
      ? (await localProtocols())[name]!
      : cloudProtocols(false)[name]!;

  let cacheMade: C | undefined;
  const cache = () => (cacheMade ??= config.cache!(host().storage));

  return {
    host,
    apis,
    hasLocal: config.local !== undefined,
    cloudProtocols,
    localProtocols,
    protocolOf,
    cache,
  };
};

/** The Backend an app with no Accounts runs on: the one its launch asked
 * for, else the cloud, and changed by hand. */
const backendStore = (core: ReturnType<typeof makeCore>) => {
  let backend: Backend | null = null;
  const listeners = new Set<() => void>();
  const current = (): Backend => {
    if (backend === null) {
      const asked = core.host().lifecycle.launchBackend();
      backend = asked === 'local' && core.hasLocal ? 'local' : 'cloud';
    }
    return backend;
  };
  return {
    current,
    subscribe: (changed: () => void) => {
      listeners.add(changed);
      return () => void listeners.delete(changed);
    },
    set: (next: Backend) => {
      backend = next === 'local' && core.hasLocal ? 'local' : 'cloud';
      listeners.forEach((changed) => changed());
    },
  };
};

/**
 * An app on any platform. Nothing runs until a screen first asks, so it
 * can be made where the Host is not there yet, as on a web server. With
 * `auth`, it runs sign-in on this device on the cloud or the Local
 * Backend, and opens one Session per active Account, with every API signed
 * as them and a Std Sync named for them; the app's Session says what that
 * Session holds, this says when. Make one per app. The Web Platform's
 * `createApp` calls it with the browser's Host; tests call it with one in
 * memory.
 */
export function createApp<A extends Apis, S, C = never>(
  config: AppConfig<A, S, C> & { readonly auth: AuthConfig<A, S> },
): AuthApp<A, S, C>;
export function createApp<A extends Apis, C = never>(
  config: AppConfig<A, never, C> & { readonly auth?: undefined },
): PublicApp<A, C>;
export function createApp<A extends Apis, S, C>(
  config: AppConfig<A, S, C>,
): AuthApp<A, S, C> | PublicApp<A, C> {
  const core = makeCore(config);
  return config.auth === undefined
    ? publicApp(core)
    : authApp(core, config.auth);
}

const publicApp = <A extends Apis, C>(
  core: ReturnType<typeof makeCore<A, C>>,
) => {
  const backend = backendStore(core);
  const publics = publicClients(core.apis, {
    backend: backend.current,
    protocol: core.protocolOf,
  });
  return {
    /** Where the app runs. */
    host: core.host,
    /** This device's cache, opened on first use. */
    cache: core.cache,
    /** One API's client. */
    useApi: <K extends keyof A & string>(name: K): ApiClients<A>[K] =>
      publics[name],
    /** The Backend the app runs on, and changing it. */
    useBackend: () => ({
      backend: useSyncExternalStore(
        backend.subscribe,
        backend.current,
        () => 'cloud' as const,
      ),
      setBackend: backend.set,
    }),
  };
};

/** An app with no Accounts, as `createApp` makes it. */
export type PublicApp<A extends Apis, C> = ReturnType<typeof publicApp<A, C>>;

const authApp = <A extends Apis, S, C>(
  core: ReturnType<typeof makeCore<A, C>>,
  auth: AuthConfig<A, S>,
) => {
  const { host, apis } = core;
  const session =
    auth.session ??
    (defineSession(apis, () => Effect.void) as unknown as SessionDef<A, S>);

  const gate = createGate<Opened<S>, Link | Signing>({
    host,
    cloud: () => {
      const accounts = host().cloud.accounts;
      if (accounts === undefined)
        throw new Error('An app with auth needs a Host with Accounts');
      return Layer.mergeAll(
        accounts,
        Layer.sync(Link, () => ({
          protocols: () => core.cloudProtocols(true),
          store: host().storage.sync,
          keep: (userIds) =>
            Effect.tryPromise(() =>
              keepSyncs(userIds, host().storage.sync),
            ).pipe(
              Effect.catch((error) => Effect.logWarning('[syncs]', error)),
              Effect.asVoid,
            ),
        })),
      ) as Layer.Layer<Accounts | Link | Signing>;
    },
    ...(core.hasLocal && {
      local: async (choose) => {
        const protocols = await core.localProtocols();
        return Layer.mergeAll(
          fakeAccounts({
            choose,
            // In the database named `device`, where devices have kept
            // their Local Accounts since this Backend was called that.
            storage: host().storage.table(fakeAccountsTable, 'device'),
          }),
          Layer.succeed(Link, {
            protocols: () => protocols,
            // The Local Backend keeps everything already: a Session's Std
            // Sync lives in memory, and there is nothing to delete.
            store: Sync.memory(),
            keep: () => Effect.void,
          }),
        );
      },
    }),
    session: (account, status) =>
      Effect.gen(function* () {
        const { protocols, store } = yield* Link;
        const signing = yield* Effect.context<Signing>();
        const accounts = Context.get(signing, Accounts);
        return yield* openSession({
          apis,
          protocols: Object.fromEntries(
            Object.entries(protocols()).map(([name, protocol]) => [
              name,
              sendingAs(protocol, account, accounts),
            ]),
          ) as never,
          store,
          account,
          signing: Layer.succeedContext(signing),
          status,
          open: session.open,
          service: session.Service,
        });
      }),
    keep: (userIds) => Link.use((link) => link.keep(userIds)),
  });
  const react = gateReact(gate);
  const publics = publicClients(apis, {
    backend: () => gate.backend() ?? 'cloud',
    protocol: core.protocolOf,
  });

  // Gives the open Session to everything under SignedIn.
  function Provide(props: { readonly children: ReactNode }) {
    return (
      <OpenSessionProvider opened={react.useSession() as Opened<unknown>}>
        {props.children}
      </OpenSessionProvider>
    );
  }

  /**
   * Renders `children` while an Account is open, `fallback` otherwise (a
   * node, or one per view). Everything inside remounts on an Account
   * Switch, so wrap as little as the part that needs an Account.
   */
  function SignedIn(props: {
    readonly children: ReactNode;
    readonly fallback?: ReactNode | ((view: NotOpen<S>) => ReactNode);
  }) {
    return (
      <react.SignedIn
        fallback={
          props.fallback as
            | ReactNode
            | ((view: NotOpen<Opened<S>>) => ReactNode)
        }
      >
        <Provide>{props.children}</Provide>
      </react.SignedIn>
    );
  }

  return {
    /** Where the app runs. */
    host,
    /** The Gate itself, outside React: for tests and non-React code. */
    gate,
    /** This device's cache, opened on first use. */
    cache: core.cache,
    SignedIn,
    SignedOut: react.SignedOut,
    /** The Gate, anywhere: what it shows, the Backend, online, signing in. */
    useGate: react.useGate,
    /** The Accounts signed in, what is done with them, and `manage`: the
     * sign-in service's page for them. Only inside `SignedIn`. */
    useAccounts: () => ({
      ...react.useAccounts(),
      manage: () => host().cloud.manageAccounts?.() ?? Promise.resolve(),
    }),
    /** The open Session's value; only inside `SignedIn`. */
    useSession: session.use,
    /** Runs an Effect in the open Session; only inside `SignedIn`. */
    useRun: session.useRun,
    /** Whether the open Account has been confirmed, live. */
    useStatus: session.useStatus,
    /** One API's client: signed as the open Account inside `SignedIn`, and
     * as nobody outside it, where only a public call goes out. */
    useApi: <K extends keyof A & string>(name: K): ApiClients<A>[K] => {
      const opened = useOpenedOrNone();
      return (opened?.apis[name] ?? publics[name]) as ApiClients<A>[K];
    },
    /** The open Session, for Effect code: `yield* app.Session`. */
    Session: session.Service,
  };
};

/** An app with Accounts, as `createApp` makes it. */
export type AuthApp<A extends Apis, S, C> = ReturnType<typeof authApp<A, S, C>>;
