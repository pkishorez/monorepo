import {
  Suspense,
  lazy,
  useCallback,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ComponentType, ReactNode } from 'react';
import type { AppRuntime } from '@kestack/kabuki/react/view';
import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { KeyboardIcon, PanelBottomIcon, RotateCwIcon } from 'lucide-react';
import { split } from './files.tsx';

/*
 * A kabuki app running on the page, the one way every page shows one: a
 * window with the app in it and, beside its tab, a tab per file of its
 * code, all the same height, so switching moves nothing. The app stays
 * mounted under another tab, so it keeps running. The devtools sit under
 * the app, closed until the reader opens them from the window's bar, or
 * open from the start on a page about going back in time. Showing a past
 * Step makes the app read only. The devtools load apart from the page, so
 * the app is ready before they are.
 *
 * An app played with the keys, as a game is, hands the window its key
 * lock: while most of the app is in view, or after a click on it, the
 * window locks the keys to it and rings itself to say so. Scrolling it
 * away, or the Esc the lock listens for, unlocks them.
 *
 * A whole site, laid out by its own width, fills the window edge to edge
 * instead of sitting in the middle of it, and can be reloaded from its
 * tab: the app starts over, its History cleared.
 */

/** What `View.app` makes: the app, and a way to read its Runtime. */
export type LiveApp = ComponentType & {
  readonly useRuntime: () => AppRuntime;
};

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

const tab =
  'flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

export function Live({
  app: App,
  url,
  caption,
  devtools = false,
  tall = false,
  site = false,
  keys,
  children,
}: {
  /** What `View.app` makes. */
  readonly app: LiveApp;
  /** The address on the app's tab; without one, the tab says Output. */
  readonly url?: string;
  /** A line under the window on what to try. */
  readonly caption?: string;
  /** The devtools open from the start, for a page about going back in time. */
  readonly devtools?: boolean;
  /** The app is taller than most, as a game board is. */
  readonly tall?: boolean;
  /** The app is a whole site: it fills the window, and reloads from its tab. */
  readonly site?: boolean;
  /** The app's key lock, for an app played with the keys. */
  readonly keys?: KeyLock;
  /** Its code: blocks that include a file, ```ts file=./counter.ts. */
  readonly children?: ReactNode;
}) {
  const [shown, setShown] = useState<number | null>(null);
  const [open, setOpen] = useState(devtools);
  const { files } = split(children);
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
  const height = tall ? 'h-[38rem]' : 'h-[20rem]';
  return (
    <figure className="my-8">
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.18)]">
        <div className="flex items-center border-b border-border bg-muted/40 pr-1.5">
          <div
            role="tablist"
            aria-label="The app and its code"
            className="flex min-w-0 flex-1 overflow-x-auto px-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={shown === null}
              onClick={() => setShown(null)}
              className={tab}
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {url ? (
                <span className="font-mono text-xs">{url}</span>
              ) : (
                'Output'
              )}
            </button>
            {site && <Reload app={App} />}
            {files.map((file, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={shown === index}
                onClick={() => setShown(index)}
                className={`${tab} font-mono text-xs`}
              >
                {file.props['data-file']}
              </button>
            ))}
          </div>
          {keys && (
            <p
              aria-live="polite"
              className={`hidden items-center gap-1.5 px-2 text-xs whitespace-nowrap text-muted-foreground transition-opacity duration-200 sm:flex ${locked ? 'opacity-100' : 'opacity-0'}`}
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
          <DevtoolsToggle app={App} open={open} setOpen={setOpen} />
        </div>
        <div className={height}>
          <div
            role="tabpanel"
            hidden={shown !== null}
            ref={watch}
            onPointerDown={() => keys?.set(true)}
            className="h-full"
          >
            <ReadOnlyInPast
              app={App}
              className={`h-full ${site ? '@container relative' : 'grid place-items-center overflow-auto p-6'}`}
            >
              <App />
            </ReadOnlyInPast>
          </div>
          {files.map((file, index) => (
            <div
              key={index}
              role="tabpanel"
              hidden={shown !== index}
              className="h-full [&>pre]:m-0 [&>pre]:h-full [&>pre]:overflow-auto [&>pre]:rounded-none [&>pre]:border-0"
            >
              {file}
            </div>
          ))}
        </div>
        {open && (
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
        )}
        {keys && (
          <span
            aria-hidden
            className={`pointer-events-none absolute inset-0 rounded-xl ring-2 ring-primary/70 ring-inset transition-opacity duration-200 ${locked ? 'opacity-100' : 'opacity-0'}`}
          />
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {caption}
        </figcaption>
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
  readonly app: LiveApp;
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

function Reload({ app: App }: { readonly app: LiveApp }) {
  const { clear } = App.useRuntime();
  return (
    <button
      type="button"
      onClick={clear}
      aria-label="Reload: start the app over"
      title="Reload: start the app over"
      className="-ml-2 grid size-10 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <RotateCwIcon className="size-3" />
    </button>
  );
}

/**
 * Opens and closes the devtools. Closing them goes back to the present:
 * a past Step left on show would keep the app inert, with nothing on
 * screen to bring it back.
 */
function DevtoolsToggle({
  app: App,
  open,
  setOpen,
}: {
  readonly app: LiveApp;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}) {
  const { shown, show } = App.useRuntime();
  return (
    <button
      type="button"
      aria-pressed={open}
      onClick={() => {
        if (open && shown !== null) show(null);
        setOpen(!open);
      }}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-background aria-pressed:text-foreground"
    >
      <PanelBottomIcon className="size-3.5" />
      Devtools
    </button>
  );
}

function Devtools({ app: App }: { readonly app: LiveApp }) {
  return <KabukiInspector runtime={App.useRuntime()} timelineAt="top" />;
}
