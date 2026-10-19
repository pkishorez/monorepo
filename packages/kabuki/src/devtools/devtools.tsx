import { useState } from 'react';
import type { ComponentProps, CSSProperties } from 'react';
import type { AppRuntime } from '../react/index.ts';
import { Tree, X } from './icons/index.ts';
import { INK, ink } from './ink/index.ts';
import { InspectorView, RuntimeInspector } from './inspector.tsx';
import { Shadow } from './shadow.tsx';

/*
 * The Kabuki devtools, each in a shadow root of its own with its own
 * styles, so they look the same on any page and change none of it.
 *
 * 1. KabukiDevtools    the Inspector on a running app, filling what holds it.
 * 2. Inspector         the Inspector on any Step given it, for a story or a
 *                      recording.
 * 3. FloatingDevtools  a button in the page's bottom-right corner that opens
 *                      KabukiDevtools in a panel above it, over the page.
 */

type Placed = {
  /** Classes for its host, an element of the page: they size it, and paint over its background. */
  readonly className?: string;
  readonly style?: CSSProperties;
};

/** 1. The Inspector on a running app, from `App.useRuntime()` or `Start.useRuntime()`. */
export function KabukiDevtools({
  className,
  style,
  ...props
}: ComponentProps<typeof RuntimeInspector> & Placed) {
  return (
    <Shadow ground className={className} style={style}>
      <RuntimeInspector {...props} />
    </Shadow>
  );
}

/** 2. The Inspector on the Step given it, with a Timeline the caller drives. */
export function Inspector({
  className,
  style,
  ...props
}: ComponentProps<typeof InspectorView> & Placed) {
  return (
    <Shadow ground className={className} style={style}>
      <InspectorView {...props} />
    </Shadow>
  );
}

/** Over everything on the page, as devtools are. */
const ON_TOP: CSSProperties = { position: 'relative', zIndex: 2147483000 };

/**
 * 3. A button fixed in the bottom-right corner that opens the devtools in a
 * panel above it, and closes them again; Escape closes them too. A past
 * Step shown is marked on the button. Drawn with no runtime, as on a
 * server, it is the button alone.
 */
export function FloatingDevtools({
  runtime,
  defaultOpen = false,
}: {
  /** The running app: `App.useRuntime()` or `Start.useRuntime()`. */
  readonly runtime: AppRuntime | null;
  /** Open at first. */
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const past = runtime?.shown != null;
  return (
    <Shadow style={ON_TOP}>
      {open && runtime && (
        <section
          aria-label="Kabuki devtools"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
          className="bg-background fixed right-4 bottom-[4.5rem] flex h-[min(36rem,calc(100dvh-6rem))] w-[min(60rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_48px_rgb(0_0_0/0.22)]"
        >
          <RuntimeInspector runtime={runtime} />
        </section>
      )}
      <button
        type="button"
        aria-label={
          open ? 'Close the Kabuki devtools' : 'Open the Kabuki devtools'
        }
        aria-expanded={open}
        title={
          past ? 'Kabuki devtools: showing a past Step' : 'Kabuki devtools'
        }
        onClick={() => setOpen((was) => !was)}
        style={INK}
        className="bg-foreground text-background fixed right-4 bottom-4 grid size-11 place-items-center rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.1),0_6px_18px_rgb(0_0_0/0.22)] transition-[scale,opacity] duration-150 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.96] [&_svg]:size-5"
      >
        {open ? <X /> : <Tree />}
        {past && (
          <span className="bg-background absolute top-0.5 right-0.5 grid size-3 place-items-center rounded-full">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: ink('message') }}
            />
          </span>
        )}
      </button>
    </Shadow>
  );
}
