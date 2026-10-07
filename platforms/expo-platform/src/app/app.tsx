import {
  type Apis,
  type AuthApp,
  createApp as createPlatformApp,
  type DeviceBackends,
  type GateView,
  type PublicApp,
  type SessionDef,
  type Storage,
} from '@kstackz/platform-toolkit';
import type { ReactNode } from 'react';
import { AccountLost } from '../recipes/account-lost';
import { type GateScreen, GateScreens } from '../recipes/gate-screens';
import { LocalSignIn, type LocalSignInChoice } from '../recipes/local-sign-in';
import { expoHost } from './host';

/** Signing in, for an app that has Accounts: as the app's First-Party OAuth
 * client, in the system sign-in sheet. */
export interface ExpoAuth<A extends Apis, S> {
  /** The shared sign-in service. */
  readonly url: string;
  /** The app's First-Party Client at the sign-in service. */
  readonly clientId: string;
  /** The audience the cloud APIs check an Access Token for. */
  readonly resource: string;
  /** What one Account keeps while it is active. */
  readonly session?: SessionDef<A, S>;
  /** Who to try the device Backend as, in one tap. */
  readonly presets?: ReadonlyArray<LocalSignInChoice>;
}

/** What a native app gives `createApp`. Everything else is given: the
 * phone's Storage, network and foreground, and the screens before an
 * Account is open. */
export interface ExpoAppConfig<A extends Apis, S, C> {
  /** Names what the app keeps on the phone. */
  readonly name: string;
  /** The app's name, as people read it. */
  readonly title: string;
  /** One line on what the app is for, under its name before sign-in. */
  readonly description?: string;
  /** The app's mark, above its name before sign-in. */
  readonly mark?: ReactNode;
  /** Where the cloud Backend's APIs answer: a phone has no origin. */
  readonly apiUrl: string;
  readonly apis?: A;
  /** The device Backend: every API's handlers on the phone's Storage. */
  readonly device?: (
    storage: Storage,
  ) => DeviceBackends<A> | Promise<DeviceBackends<A>>;
  readonly auth?: ExpoAuth<A, S>;
  /** What only this phone keeps, such as Settings. */
  readonly cache?: (storage: Storage) => C;
}

type NotOpen<S> = Exclude<GateView<S>, { kind: 'open' }>;

const screenOf = (
  view: Exclude<NotOpen<unknown>, { kind: 'accountLost' }>,
): GateScreen => {
  switch (view.kind) {
    case 'checking':
    case 'signingOut':
      return { kind: view.kind };
    case 'opening':
    case 'unopenable':
      return { kind: view.kind, name: view.account.user.name };
    case 'signedOut':
      return { kind: 'signedOut', unreachable: view.unreachable };
  }
};

/**
 * A native app: its APIs on the cloud Backend at `apiUrl` or on the device
 * Backend in the app, and, with `auth`, several Accounts signed in on this
 * phone, one Session each. `Root` goes around the whole app; `SignedIn`
 * wraps what needs an Account and shows the right screen otherwise. The
 * same app as the Web Platform's `createApp` gives, on a phone. Make one
 * per app.
 */
export function createApp<A extends Apis, S, C = never>(
  config: ExpoAppConfig<A, S, C> & { readonly auth: ExpoAuth<A, S> },
): ExpoAuthApp<A, S, C>;
export function createApp<A extends Apis, C = never>(
  config: ExpoAppConfig<A, never, C> & { readonly auth?: undefined },
): ExpoPublicApp<A, C>;
export function createApp<A extends Apis, S, C>(
  config: ExpoAppConfig<A, S, C>,
): ExpoAuthApp<A, S, C> | ExpoPublicApp<A, C> {
  const { auth } = config;
  const host = () =>
    expoHost({
      name: config.name,
      apiUrl: config.apiUrl,
      auth:
        auth === undefined
          ? undefined
          : { url: auth.url, clientId: auth.clientId, resource: auth.resource },
    });
  const parts = {
    host,
    ...(config.apis !== undefined && { apis: config.apis }),
    ...(config.device !== undefined && { device: config.device }),
    ...(config.cache !== undefined && { cache: config.cache }),
  };
  // A phone has no root document; the app is its own root.
  const Plain = (props: { readonly children: ReactNode }) => props.children;

  if (auth === undefined) {
    const app = createPlatformApp(parts as never) as unknown as PublicApp<A, C>;
    return { ...app, Root: Plain };
  }

  const app = createPlatformApp({
    ...(parts as object),
    host,
    auth: auth.session === undefined ? {} : { session: auth.session },
  } as never) as AuthApp<A, S, C>;

  /** Around the whole app: asks who signs in to the device Backend. */
  function Root(props: { readonly children: ReactNode }) {
    const { asking, answer } = app.useGate().namedSignIn;
    return (
      <>
        {props.children}
        {config.device !== undefined && (
          <LocalSignIn
            open={asking}
            presets={auth?.presets ?? []}
            onChoose={answer}
            onCancel={() => answer(null)}
          />
        )}
      </>
    );
  }

  /** The screen for whatever stands before an open Account. */
  function GateFallback(props: { readonly view: NotOpen<S> }) {
    const gate = app.useGate();
    const view = props.view as NotOpen<unknown>;
    if (view.kind === 'accountLost')
      return (
        <AccountLost
          lost={view.account.user}
          others={view.accounts.map(({ user }) => user)}
          onSignInAgain={() => void gate.signIn()}
          onSwitch={gate.switchTo}
          onSignOut={() => void gate.signOut()}
        />
      );
    const notice = gate.notice;
    return (
      <GateScreens
        title={config.title}
        {...(config.description !== undefined && {
          description: config.description,
        })}
        mark={config.mark}
        screen={screenOf(view)}
        backend={gate.backend}
        hasDevice={config.device !== undefined}
        loginError={
          notice?.kind === 'loginError'
            ? (notice.error.description ?? 'Sign in didn’t finish. Try again.')
            : null
        }
        onLoginErrorShown={gate.dismissNotice}
        onSignIn={gate.signIn}
        onCheckAgain={gate.checkAgain}
        onRetry={gate.retry}
        onSignOut={() => void gate.signOut()}
        onBackend={(backend) => void gate.setBackend(backend)}
      />
    );
  }

  /**
   * Renders `children` while an Account is open, and otherwise the screen
   * for where sign-in stands, unless `fallback` says otherwise.
   * Everything inside remounts on an Account Switch.
   */
  function SignedIn(props: {
    readonly children: ReactNode;
    readonly fallback?: ReactNode | ((view: NotOpen<S>) => ReactNode);
  }) {
    return (
      <app.SignedIn
        fallback={props.fallback ?? ((view) => <GateFallback view={view} />)}
      >
        {props.children}
      </app.SignedIn>
    );
  }

  return { ...app, SignedIn, Root };
}

/** A native app with Accounts, as `createApp` makes it. */
export type ExpoAuthApp<A extends Apis, S, C> = AuthApp<A, S, C> & {
  /** Around the whole app, in the root layout. */
  readonly Root: (props: { readonly children: ReactNode }) => ReactNode;
};

/** A native app with no Accounts, as `createApp` makes it. */
export type ExpoPublicApp<A extends Apis, C> = PublicApp<A, C> & {
  readonly Root: (props: { readonly children: ReactNode }) => ReactNode;
};
