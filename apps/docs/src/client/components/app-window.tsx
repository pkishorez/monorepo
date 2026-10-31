import { Suspense, lazy, useCallback, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { KeyboardIcon, RotateCwIcon } from 'lucide-react';
import type { PlaygroundApp } from './playground/index.ts';

/*
 * A demo app in a window of its own, the way it would sit in a browser:
 * a title bar with its address, the app in the middle, and the Kabuki
 * devtools under it, in the same window, always open, their Timeline at
 * their top, right under the app it travels. Showing a past Step
 * makes the app read only. The devtools load apart from the page, so the
 * app is ready before they are.
 *
 * An app played with the keys, as a game is, hands the window its key
 * lock: while most of the app is in view, or after a click on it, the
 * window locks the keys to it and rings itself to say so. Scrolling it
 * away, or the Esc the lock listens for, unlocks them.
 *
 * A whole site, laid out by its own width, fills the window edge to edge
 * instead of sitting in the middle of it, and can be reloaded from the
 * address bar: the app starts over, its History cleared.
 */

/** Whether the page hands an app its keys. */
export interface KeyLock {
  readonly locked: boolean;
  readonly set: (on: boolean) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

/** How much of the app must be in view for it to take the keys. */
const IN_VIEW = 0.6;

const never = () => () => {};

const KabukiInspector = lazy(() =>
  import('@kestack/devtools-kabuki/inspector').then((module) => ({
    default: module.KabukiInspector,
  })),
);

export function AppWindow({
  app: App,
  url,
  tall = false,
  site = false,
  keys,
}: {
  /** What `View.app` makes. */
  readonly app: PlaygroundApp;
  /** The address in the title bar. */
  readonly url: string;
  /** The app is taller than most, as a game board is. */
  readonly tall?: boolean;
  /** The app is a whole site: it fills the window, and reloads from the address bar. */
  readonly site?: boolean;
  /** The app's key lock, for an app played with the keys. */
  readonly keys?: KeyLock;
}) {
  const locked = useSyncExternalStore(
    keys?.subscribe ?? never,
    () => keys?.locked ?? false,
    () => false,
  );
  // Locks the keys while most of the app is in view, and lets them go as
  // it scrolls away or leaves the page.
  const watch = useCallback(
    (area: HTMLDivElement | null) => {
      if (!area || !keys) return;
      const observer = new IntersectionObserver(
        ([entry]) => keys.set((entry?.intersectionRatio ?? 0) >= IN_VIEW),
        { threshold: [0, IN_VIEW] },
      );
      observer.observe(area);
      return () => {
        observer.disconnect();
        keys.set(false);
      };
    },
    [keys],
  );
  return (
    <figure className="relative my-8 overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
      <div className="grid h-10 grid-cols-[1fr_minmax(0,20rem)_1fr] items-center gap-3 border-b border-border bg-muted/40 px-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <div className="relative flex h-6 items-center justify-center rounded-md bg-background px-2.5 font-mono text-xs text-muted-foreground">
          {url}
          {site && <Reload app={App} />}
        </div>
        {keys && (
          <p
            aria-live="polite"
            className={`flex items-center justify-end gap-1.5 text-xs whitespace-nowrap text-muted-foreground transition-opacity duration-200 ${locked ? 'opacity-100' : 'opacity-0'}`}
          >
            <KeyboardIcon className="size-3.5" />
            {locked && (
              <>
                Keys locked to the app
                <Kbd>Esc</Kbd>
              </>
            )}
          </p>
        )}
      </div>
      <div ref={watch} onPointerDown={() => keys?.set(true)}>
        <ReadOnlyInPast
          app={App}
          className={`${site ? '@container relative' : 'grid place-items-center overflow-auto p-6'} ${tall ? 'h-[38rem]' : 'h-[20rem]'}`}
        >
          <App />
        </ReadOnlyInPast>
      </div>
      <div className="h-[26rem] border-t border-border">
        <Suspense
          fallback={
            <p className="grid h-full place-items-center text-sm text-muted-foreground">
              Opening the devtools…
            </p>
          }
        >
          <Devtools app={App} />
        </Suspense>
      </div>
      {keys && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/70 ring-inset transition-opacity duration-200 ${locked ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </figure>
  );
}

// Each part that reads the running app follows it on its own, so a
// Message redraws only them, not the window: the app itself is handed in
// already made, and redraws only as its Views do.

function ReadOnlyInPast({
  app: App,
  className,
  children,
}: {
  readonly app: PlaygroundApp;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const past = App.useRuntime().shown !== null;
  return (
    <div inert={past} className={className}>
      {children}
    </div>
  );
}

function Reload({ app: App }: { readonly app: PlaygroundApp }) {
  const { clear } = App.useRuntime();
  return (
    <button
      type="button"
      onClick={clear}
      aria-label="Reload: start the app over"
      title="Reload: start the app over"
      className="absolute right-1 grid size-5 place-items-center rounded transition-colors duration-150 outline-offset-1 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <RotateCwIcon className="size-3" />
    </button>
  );
}

function Devtools({ app: App }: { readonly app: PlaygroundApp }) {
  return <KabukiInspector runtime={App.useRuntime()} timelineAt="top" />;
}
