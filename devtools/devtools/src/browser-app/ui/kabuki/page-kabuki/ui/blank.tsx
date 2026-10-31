import type { ReactNode } from 'react';
import type { Link } from './session-list.js';

/*
 * What the page shows where no Inspector is: DevTools not reached yet, no
 * Kabuki Session connected, none picked, or the one picked gone.
 */

/** How an app connects to the DevTools Server at `server`, as it would write it. */
const snippet = (
  server: string,
) => `import { connect } from '@kestack/devtools-kabuki/session';

View.app(AppView, {
  layer,
  // environment: optional; the page's host by default.
  attach: [connect({ url: '${server}' })],
});`;

function Blank({
  title,
  children,
  wide = false,
}: {
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly wide?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 overflow-auto">
      <div
        className={`m-auto flex w-full flex-col px-6 py-10 ${wide ? 'max-w-lg' : 'max-w-sm'}`}
      >
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Pulse() {
  return (
    <span aria-hidden className="relative flex size-2 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60 motion-reduce:hidden" />
      <span className="relative size-2 rounded-full bg-emerald-500" />
    </span>
  );
}

export function Connecting() {
  return (
    <div
      role="status"
      className="m-auto flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 motion-reduce:animate-none" />
      Connecting to DevTools…
    </div>
  );
}

/** No Kabuki Session connected: how to connect one to this DevTools Server, the page's own origin, while it waits for one. */
export function Waiting({ link }: { readonly link: Link }) {
  return (
    <Blank title="No Kabuki apps connected" wide>
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        A running Kabuki app shows up here as a Kabuki Session the moment it
        connects, under its app and where it runs, and leaves when it closes.
        Attach{' '}
        <code className="font-mono text-[13px] text-foreground">connect</code>{' '}
        to it:
      </p>
      <pre className="mt-5 overflow-x-auto rounded-lg border border-border/60 bg-muted/40 px-4 py-3 font-mono text-xs leading-relaxed text-foreground/90">
        {snippet(location.origin)}
      </pre>
      <p
        role="status"
        className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"
      >
        {link === 'live' ? (
          <>
            <Pulse />
            Listening for Kabuki apps
          </>
        ) : (
          <>
            <span className="size-1.5 animate-pulse rounded-full bg-amber-500/80 motion-reduce:animate-none" />
            Reconnecting to DevTools…
          </>
        )}
      </p>
    </Blank>
  );
}

/** Kabuki Sessions listed, none picked. */
export function Unpicked({ count }: { readonly count: number }) {
  return (
    <Blank
      title={
        count === 0 ? 'No Kabuki apps connected' : 'Choose a Kabuki Session'
      }
    >
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        {count === 0
          ? 'A running Kabuki app shows up here the moment it connects.'
          : 'Its Actor tree and History open here. Picking a Step on the Timeline travels the app itself.'}
      </p>
    </Blank>
  );
}

/** The Kabuki Session picked is not connected: it opens again once it is. */
export function Away({
  name,
  reconnecting,
}: {
  readonly name: string;
  readonly reconnecting: boolean;
}) {
  return (
    <Blank
      title={
        <>
          <span className="font-mono">{name}</span> is not connected
        </>
      }
    >
      <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
        {reconnecting
          ? 'DevTools is out of reach. This opens again once it is back and the app is connected.'
          : 'Its app may have closed or reloaded. This opens again as soon as a Kabuki Session of this name connects.'}
      </p>
    </Blank>
  );
}
