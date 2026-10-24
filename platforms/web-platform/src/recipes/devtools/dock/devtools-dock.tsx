import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import {
  AppWindow,
  Maximize2,
  Network,
  PanelBottom,
  PanelRight,
  X,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from '#components/context-menu';
import { useIsMobile } from '#hooks/use-mobile';
import { cn } from '#lib/utils';

/*
 * The Devtools Dock: a page with devtools beside it, opened from one button
 * that never moves.
 *
 * 1. Keep    whether it is open, its Layout and each Layout's size, in
 *            `localStorage`, so a reload finds it as it was left.
 * 2. Lay out the page fills what the devtools leave: a full-screen layer
 *            over it, a bar under it or a side panel on its right, both
 *            pushing it aside and resizable by their edge, or a floating
 *            window, moved by its title and resized by any corner. A page
 *            that scrolls the window, as a site does, is left in the
 *            document's flow: the bar and the panel are fixed over it, and
 *            the body is padded by their size so nothing hides under them.
 * 3. Button  two icons, fixed in the bottom-right corner at one size
 *            whatever is open or marked: open and close, and the Layout. A
 *            click on the Layout steps to the next one; a right click or a
 *            long press picks one from a menu. On a phone only full screen
 *            and the bottom bar make sense, so only they are offered, and a
 *            Layout kept from a wide screen shows as the nearest of them.
 *            It sits in the row of the devtools' bottom bar, which are
 *            handed the room it takes as `--dock-reserve`.
 * 4. Keys    Ctrl+/ or ⌘/ opens and closes them.
 */

export type DockLayout = 'full' | 'bottom' | 'side' | 'floating';

interface Kept {
  readonly open: boolean;
  readonly layout: DockLayout;
  readonly bottom: number;
  readonly side: number;
  readonly floating: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

const INITIAL: Kept = {
  open: false,
  layout: 'full',
  bottom: 360,
  side: 480,
  floating: { x: 48, y: 48, width: 720, height: 480 },
};

const LAYOUTS = [
  { value: 'full', label: 'Full screen', Icon: Maximize2, phone: true },
  { value: 'bottom', label: 'Bottom', Icon: PanelBottom, phone: true },
  { value: 'side', label: 'Right side', Icon: PanelRight, phone: false },
  { value: 'floating', label: 'Floating', Icon: AppWindow, phone: false },
] as const;
/** On a phone, what a wide screen's Layout shows as. */
const ON_PHONE: Record<DockLayout, DockLayout> = {
  full: 'full',
  bottom: 'bottom',
  side: 'bottom',
  floating: 'full',
};

const MIN = 200;
const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));

export function DevtoolsDock({
  devtools,
  children,
  label = 'Devtools',
  status,
  storageKey = 'devtools-dock',
  scrolls = 'dock',
}: {
  /** The devtools, drawn for the Layout they are in. */
  readonly devtools: (layout: DockLayout) => ReactNode;
  /** The page. */
  readonly children: ReactNode;
  readonly label?: string;
  /** A mark on the button's corner, such as a dot for a page showing the past; it never changes the button's size. */
  readonly status?: ReactNode;
  /** Where the Dock keeps how it was left. */
  readonly storageKey?: string;
  /**
   * What scrolls the page: `dock`, a box the height of the screen that the
   * page fills, for an app that scrolls its own parts; or `window`, for a
   * site whose page scrolls the window, which keeps its sticky headers and
   * its scroll restoration.
   */
  readonly scrolls?: 'dock' | 'window';
}) {
  // 1. Keep
  const [kept, setKept] = useState(INITIAL);
  // Read after mount: the server renders it closed.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setKept({ ...INITIAL, ...JSON.parse(stored) });
    } catch {}
  }, [storageKey]);
  const keep = (change: Partial<Kept> | ((was: Kept) => Partial<Kept>)) =>
    setKept((was) => {
      const next = {
        ...was,
        ...(typeof change === 'function' ? change(was) : change),
      };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  const phone = useIsMobile();
  const offered = LAYOUTS.filter((each) => !phone || each.phone);
  const { open } = kept;
  const layout = phone ? ON_PHONE[kept.layout] : kept.layout;
  const current = offered.find((each) => each.value === layout)!;
  const next = offered[(offered.indexOf(current) + 1) % offered.length]!;

  // 4. Keys
  const toggle = useRef(() => {});
  toggle.current = () => keep((was) => ({ open: !was.open }));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!((event.ctrlKey || event.metaKey) && event.key === '/')) return;
      event.preventDefault();
      toggle.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 3. Button: how much room it takes from the corner.
  const button = useRef<HTMLDivElement>(null);
  const [reserve, setReserve] = useState(0);
  useEffect(() => {
    const at = button.current;
    if (!at) return;
    const measure = () =>
      setReserve(window.innerWidth - at.getBoundingClientRect().left);
    const observer = new ResizeObserver(measure);
    observer.observe(at);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const clear = { '--dock-reserve': `${reserve}px` } as CSSProperties;

  // 2. Lay out
  const docked = open && (layout === 'bottom' || layout === 'side');
  const size = layout === 'bottom' ? kept.bottom : kept.side;
  const inFlow = scrolls === 'window';
  // A page in the window's flow makes room for the bar or the panel over it.
  useEffect(() => {
    if (!inFlow || !docked) return;
    const side = layout === 'bottom' ? 'paddingBottom' : 'paddingRight';
    const body = document.body.style;
    const before = body[side];
    body[side] = `${size}px`;
    return () => {
      body[side] = before;
    };
  }, [inFlow, docked, layout, size]);

  const aside = docked && (
    <aside
      // A new Layout lays the devtools out afresh: the Map fits again.
      key={layout}
      aria-label={label}
      className={cn(
        'bg-background flex shrink-0 flex-col',
        layout === 'bottom' ? 'border-t' : 'border-l',
        !inFlow
          ? 'relative'
          : layout === 'bottom'
            ? 'fixed inset-x-0 bottom-0 z-40'
            : 'fixed inset-y-0 right-0 z-40',
      )}
      style={{
        ...clear,
        [layout === 'bottom' ? 'height' : 'width']: size,
      }}
    >
      <Edge
        along={layout === 'bottom' ? 'top' : 'left'}
        onResize={(to) =>
          keep(
            layout === 'bottom'
              ? {
                  bottom: clamp(
                    window.innerHeight - to.y,
                    MIN,
                    window.innerHeight * 0.85,
                  ),
                }
              : {
                  side: clamp(
                    window.innerWidth - to.x,
                    MIN + 120,
                    window.innerWidth * 0.85,
                  ),
                },
          )
        }
      />
      <div className="min-h-0 flex-1">{devtools(layout)}</div>
    </aside>
  );

  return (
    <>
      {inFlow ? (
        <>
          {children}
          {aside}
        </>
      ) : (
        <div
          className={cn(
            'flex h-dvh w-full overflow-hidden',
            docked && layout === 'bottom' ? 'flex-col' : 'flex-row',
          )}
        >
          <div className="relative min-h-0 min-w-0 flex-1">{children}</div>
          {aside}
        </div>
      )}

      {open && layout === 'full' && (
        <div
          role="dialog"
          aria-label={label}
          className="fixed inset-0 z-40"
          style={clear}
        >
          {devtools(layout)}
        </div>
      )}

      {open && layout === 'floating' && (
        <Floating
          label={label}
          rect={kept.floating}
          onChange={(floating) => keep({ floating })}
          onClose={() => keep({ open: false })}
        >
          {devtools(layout)}
        </Floating>
      )}

      {/* 3. Button: one size and place whatever is open, in the Timeline's row. */}
      <div
        ref={button}
        className={cn(
          'bg-background fixed right-3 bottom-[9px] z-50 flex h-9 items-center rounded-md border transition-shadow duration-150',
          !open &&
            'shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_16px_-4px_rgb(0_0_0/0.12)]',
        )}
      >
        <button
          type="button"
          aria-pressed={open}
          aria-label={`${open ? 'Close' : 'Open'} ${label}`}
          title={`${open ? 'Close' : 'Open'} ${label} (Ctrl /)`}
          onClick={() => keep({ open: !open })}
          className="text-muted-foreground hover:text-foreground aria-pressed:text-foreground aria-pressed:bg-muted relative grid h-full w-9 place-items-center rounded-l-[5px] transition-colors duration-150 outline-offset-2 focus-visible:outline-2 [&_svg]:size-4"
        >
          <Network />
          {status && (
            <span className="pointer-events-none absolute top-1.5 right-1.5">
              {status}
            </span>
          )}
        </button>
        <ContextMenu>
          <ContextMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Devtools layout: ${current.label}`}
                title={`${current.label}. Click for ${next.label.toLowerCase()}, right click to pick`}
                onClick={() => keep({ layout: next.value, open: true })}
                className="text-muted-foreground hover:text-foreground grid h-full w-9 place-items-center rounded-r-[5px] border-l transition-colors duration-150 outline-offset-2 focus-visible:outline-2 [&_svg]:size-4"
              />
            }
          >
            <current.Icon />
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuRadioGroup
              value={layout}
              onValueChange={(value) =>
                keep({ layout: value as DockLayout, open: true })
              }
            >
              <ContextMenuLabel>Layout</ContextMenuLabel>
              {offered.map(({ value, label: name, Icon }) => (
                <ContextMenuRadioItem key={value} value={value} closeOnClick>
                  <Icon />
                  {name}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    </>
  );
}

/** Drag a pointer and follow it; the page keeps the cursor and selects nothing meanwhile. */
const drag =
  (cursor: string, onMove: (event: globalThis.PointerEvent) => void) =>
  (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    const move = (each: globalThis.PointerEvent) => onMove(each);
    const up = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

/** The edge a docked panel is resized by. */
function Edge({
  along,
  onResize,
}: {
  readonly along: 'top' | 'left';
  readonly onResize: (to: { x: number; y: number }) => void;
}) {
  const cursor = along === 'top' ? 'row-resize' : 'col-resize';
  return (
    <div
      role="separator"
      aria-orientation={along === 'top' ? 'horizontal' : 'vertical'}
      aria-label="Drag to resize"
      onPointerDown={drag(cursor, (event) =>
        onResize({ x: event.clientX, y: event.clientY }),
      )}
      className={cn(
        'hover:after:bg-primary/40 absolute z-20 touch-none after:absolute after:transition-[background-color] after:duration-150',
        along === 'top'
          ? 'inset-x-0 -top-1 h-2 cursor-row-resize after:inset-x-0 after:top-1 after:h-0.5'
          : 'inset-y-0 -left-1 w-2 cursor-col-resize after:inset-y-0 after:left-1 after:w-0.5',
      )}
    />
  );
}

/** A window over the page, moved by its title bar and resized by any corner. */
function Floating({
  label,
  rect,
  onChange,
  onClose,
  children,
}: {
  readonly label: string;
  readonly rect: Kept['floating'];
  readonly onChange: (rect: Kept['floating']) => void;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const width = clamp(rect.width, MIN_WIDTH, window.innerWidth - 16);
  const height = clamp(rect.height, MIN_HEIGHT, window.innerHeight - 16);
  const x = clamp(rect.x, 8, window.innerWidth - width - 8);
  const y = clamp(rect.y, 8, window.innerHeight - height - 8);
  return (
    <div
      role="dialog"
      aria-label={label}
      className="fixed z-40"
      style={{ left: x, top: y, width, height }}
    >
      {/* Rounded and clipped inside; the corners sit outside the clip, so all of each stays grabbable. */}
      <div className="bg-background flex h-full flex-col overflow-hidden rounded-xl border shadow-[0_1px_2px_rgb(0_0_0/0.06),0_16px_48px_rgb(0_0_0/0.2)]">
        <div
          onPointerDown={(start) => {
            const from = { x: start.clientX - x, y: start.clientY - y };
            drag('grabbing', (event) =>
              onChange({
                ...rect,
                width,
                height,
                x: event.clientX - from.x,
                y: event.clientY - from.y,
              }),
            )(start);
          }}
          className="text-muted-foreground relative flex h-8 shrink-0 cursor-grab items-center justify-center border-b text-xs font-medium select-none active:cursor-grabbing"
        >
          {label}
          <button
            type="button"
            aria-label={`Close ${label}`}
            title={`Close ${label} (Ctrl /)`}
            // A press on it closes the window; it never starts a move.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted absolute right-1.5 z-30 grid size-6 cursor-default place-items-center rounded-md transition-[background-color,color,scale] duration-150 ease-out outline-none focus-visible:ring-2 active:scale-[0.92] [&_svg]:size-3.5"
          >
            <X />
          </button>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
      {CORNERS.map(({ name, left, top, cursor, place }) => (
        <div
          key={name}
          aria-label={`Drag the ${name} corner to resize`}
          onPointerDown={(start) => {
            // The corner across from this one stays where it is.
            const right = x + width;
            const bottom = y + height;
            drag(cursor, (event) => {
              const across = left
                ? right - clamp(event.clientX, 8, right - MIN_WIDTH)
                : clamp(event.clientX, x + MIN_WIDTH, window.innerWidth - 8) -
                  x;
              const down = top
                ? bottom - clamp(event.clientY, 8, bottom - MIN_HEIGHT)
                : clamp(event.clientY, y + MIN_HEIGHT, window.innerHeight - 8) -
                  y;
              onChange({
                x: left ? right - across : x,
                y: top ? bottom - down : y,
                width: across,
                height: down,
              });
            })(start);
          }}
          className={cn('absolute z-20 size-5 touch-none', place)}
          style={{ cursor }}
        />
      ))}
    </div>
  );
}

const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;

/** The four corners a floating window is resized by. */
const CORNERS = [
  {
    name: 'top left',
    left: true,
    top: true,
    cursor: 'nwse-resize',
    place: '-top-1 -left-1',
  },
  {
    name: 'top right',
    left: false,
    top: true,
    cursor: 'nesw-resize',
    place: '-top-1 -right-1',
  },
  {
    name: 'bottom left',
    left: true,
    top: false,
    cursor: 'nesw-resize',
    place: '-bottom-1 -left-1',
  },
  {
    name: 'bottom right',
    left: false,
    top: false,
    cursor: 'nwse-resize',
    place: '-right-1 -bottom-1',
  },
] as const;
