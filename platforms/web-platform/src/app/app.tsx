import { type Apis, type DeviceBackends } from './apis/index.ts';
import {
  type AuthApp,
  createApp as assemble,
  type PublicApp,
} from './assemble/index.ts';
import { type GateView } from './gate/index.ts';
import { type SessionDef } from './session/index.ts';
import { type Storage } from './host/index.ts';
import type { ReactNode } from 'react';
import {
  type RootPlugin,
  webRoot,
  type WebRootOptions,
} from '../client/index.ts';
import { pwaRoot } from '../pwa/index.ts';
import { AccountLost } from '../recipes/account-lost/index.ts';
import { type GateScreen, GateScreens } from '../recipes/gate-screens/index.ts';
import {
  LocalSignIn,
  type LocalSignInChoice,
} from '../recipes/local-sign-in/index.ts';
import { createTheme } from '../theme/index.ts';
import { webHost } from './web-host.ts';

/** Signing in, for an app that has Accounts. */
export interface WebAuth<A extends Apis, S> {
  /** The shared sign-in service. */
  readonly url: string;
  /** What one Account keeps while it is active. */
  readonly session?: SessionDef<A, S>;
  /** Who to try the device Backend as, in one tap. */
  readonly presets?: ReadonlyArray<LocalSignInChoice>;
}

/** What a web app gives `createApp`. Everything else is given: the Theme,
 * the PWA, the screens before an Account is open. */
export interface WebAppConfig<A extends Apis, S, C> {
  /** Names what the app keeps on the device and tells its other tabs. */
  readonly name: string;
  /** The app's name, as people read it: every page's title. */
  readonly title: string;
  /** One line on what the app is for, under its name before sign-in. */
  readonly description?: string;
  /** The app's mark, above its name before sign-in. */
  readonly mark?: ReactNode;
  readonly apis?: A;
  /** The device Backend: every API's handlers on the device's Storage. */
  readonly device?: (
    storage: Storage,
  ) => DeviceBackends<A> | Promise<DeviceBackends<A>>;
  readonly auth?: WebAuth<A, S>;
  /** What only this device keeps, such as Settings. */
  readonly cache?: (storage: Storage) => C;
  /** The Theme's cookie is shared by every app under `cookieDomain`. */
  readonly theme?: { readonly cookieDomain?: string | undefined };
  /** The PWA is always on; this says how it asks to be installed. */
  readonly pwa?: { readonly installTitle?: string };
}

/** What `root` takes from the root route's file. */
export type RootOptions = Pick<
  WebRootOptions,
  'stylesheet' | 'icon' | 'loadTheme' | 'notFound'
>;

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
 * A web app: a PWA on TanStack Start in the app's Theme, with its APIs on
 * the cloud Backend at this origin or on the device Backend in the page,
 * and, with `auth`, several Accounts signed in on this device, one Session
 * each. `root` is the root route; `SignedIn` wraps what needs an Account
 * and shows the right screen otherwise. Make one per app, in `app.ts`.
 */
export function createApp<A extends Apis, S, C = never>(
  config: WebAppConfig<A, S, C> & { readonly auth: WebAuth<A, S> },
): WebAuthApp<A, S, C>;
export function createApp<A extends Apis, C = never>(
  config: WebAppConfig<A, never, C> & { readonly auth?: undefined },
): WebPublicApp<A, C>;
export function createApp<A extends Apis, S, C>(
  config: WebAppConfig<A, S, C>,
): WebAuthApp<A, S, C> | WebPublicApp<A, C> {
  const theme = createTheme(
    config.theme?.cookieDomain === undefined
      ? {}
      : { cookieDomain: config.theme.cookieDomain },
  );
  const host = () => webHost({ name: config.name, authUrl: config.auth?.url });
  const parts = {
    host,
    ...(config.apis !== undefined && { apis: config.apis }),
    ...(config.device !== undefined && { device: config.device }),
    ...(config.cache !== undefined && { cache: config.cache }),
  };
  const pwa = pwaRoot(
    config.pwa?.installTitle === undefined
      ? {}
      : { installTitle: config.pwa.installTitle },
  );
  const rootOf =
    (plugins: ReadonlyArray<RootPlugin>) => (options: RootOptions) =>
      webRoot({ title: config.title, theme, plugins, ...options });

  if (config.auth === undefined) {
    const app = assemble(parts as never) as unknown as PublicApp<A, C>;
    return { ...app, theme, root: rootOf([pwa]) };
  }

  const { auth } = config;
  const app = assemble({
    ...(parts as object),
    host,
    auth: auth.session === undefined ? {} : { session: auth.session },
  } as never) as AuthApp<A, S, C>;

  // Asks who signs in to the device Backend, wherever the app is.
  const named: RootPlugin = {
    Provider: (props: { readonly children: ReactNode }) => {
      const { asking, answer } = app.useGate().namedSignIn;
      return (
        <>
          {props.children}
          <LocalSignIn
            open={asking}
            presets={auth.presets ?? []}
            onChoose={answer}
            onCancel={() => answer(null)}
          />
        </>
      );
    },
  };

  /** The screen for whatever stands before an open Account. */
  function GateFallback(props: { readonly view: NotOpen<S> }) {
    const gate = app.useGate();
    const { theme: shown } = theme.useTheme();
    const notice = gate.notice;
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
    return (
      <GateScreens
        title={config.title}
        {...(config.description !== undefined && {
          description: config.description,
        })}
        mark={config.mark}
        statusBar={<theme.StatusBar />}
        theme={shown}
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
   * Everything inside remounts on an Account Switch, so wrap as little as
   * the part that needs an Account.
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

  return {
    ...app,
    SignedIn,
    theme,
    root: rootOf(config.device === undefined ? [pwa] : [pwa, named]),
  };
}

/** A web app with Accounts, as `createApp` makes it. */
export type WebAuthApp<A extends Apis, S, C> = AuthApp<A, S, C> & {
  readonly theme: ReturnType<typeof createTheme>;
  /** The root route: pass it to `createRootRoute`. */
  readonly root: (options: RootOptions) => ReturnType<typeof webRoot>;
};

/** A web app with no Accounts, as `createApp` makes it. */
export type WebPublicApp<A extends Apis, C> = PublicApp<A, C> & {
  readonly theme: ReturnType<typeof createTheme>;
  readonly root: (options: RootOptions) => ReturnType<typeof webRoot>;
};
