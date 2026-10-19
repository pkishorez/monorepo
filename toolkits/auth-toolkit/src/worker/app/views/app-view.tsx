import { useMemo, useRef } from 'react';
import { View } from '@kestack/kabuki/react';
import type { PageData } from '../api/index.ts';
import { AppLive } from '../pages/index.ts';
import { ConsentView } from './consent-view.tsx';
import { DeviceView } from './device-view.tsx';
import { ErrorView } from './error-view.tsx';
import { HomeView } from './home-view.tsx';
import { LoginView } from './login-view.tsx';
import { NotFound } from './not-found.tsx';
import { RootContext, type Root } from './root.ts';

/*
 * The root page's View: the one page the URL names, the Account menu's
 * actions handed to its chrome, and the toasts.
 */

export const AppView = View.make(
  AppLive,
  ({ model, props, children, send }) => {
    const { Home, Login, Device, Consent, Error } = children;
    // The last page data drawn, which each Frame with data keeps here.
    const last = useRef<PageData | null>(null);
    const root = useMemo(
      (): Root => ({
        busy: model.busy,
        last,
        switchTo: ({ id, email }) =>
          send({ _tag: 'SwitchChosen', userId: id, email }),
        signOut: ({ id, email }) =>
          send({ _tag: 'SignOutChosen', userId: id, email }),
        signOutAll: () => send({ _tag: 'SignOutAllChosen' }),
      }),
      [model.busy, send],
    );
    const notFound = props.route.notFound;
    return (
      <RootContext.Provider value={root}>
        {notFound !== null ? (
          <NotFound path={notFound} />
        ) : (
          ((Home && <HomeView instance={Home} />) ??
          (Login && <LoginView instance={Login} />) ??
          (Device && <DeviceView instance={Device} />) ??
          (Consent && <ConsentView instance={Consent} />) ??
          (Error && <ErrorView instance={Error} />))
        )}
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 px-4 pb-[max(24px,env(safe-area-inset-bottom))]"
        >
          {model.toasts.map((toast) => (
            <p
              key={toast.id}
              className="max-w-sm rounded-xl bg-fg px-4 py-2.5 text-center text-sm font-medium text-page shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] motion-safe:animate-toast-in"
            >
              {toast.text}
            </p>
          ))}
        </div>
      </RootContext.Provider>
    );
  },
);
