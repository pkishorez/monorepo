import { createFileRoute } from '@tanstack/react-router';
import {
  GestureDebugOverlay,
  type GestureEvent,
  GestureZone,
  rubberBand,
  settle,
  shouldCommit,
} from 'kui-toolkit/components/blocks/gestures';
import { Button } from 'kui-toolkit/components/ui/button';
import { Label } from 'kui-toolkit/components/ui/label';
import { Switch } from 'kui-toolkit/components/ui/switch';
import { HeartIcon } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { ScenarioPage } from '../components/index.ts';

export const Route = createFileRoute('/gestures')({ component: Gestures });

const ROOMS = [
  { name: 'Garden studio', note: 'Ground floor, opens onto the courtyard.' },
  { name: 'Rooftop loft', note: 'Top floor, skylights over the bed.' },
  { name: 'Canal suite', note: 'Two rooms facing the water.' },
  { name: 'Courtyard double', note: 'Quiet side, morning light.' },
  { name: 'Attic twin', note: 'Sloped ceilings, two single beds.' },
] as const;

const ACCENTS = [
  { name: 'Indigo', color: 'var(--color-chart-6)' },
  { name: 'Amber', color: 'var(--color-chart-7)' },
  { name: 'Teal', color: 'var(--color-chart-8)' },
  { name: 'Magenta', color: 'var(--color-chart-9)' },
] as const;

const MIN_SCALE = 0.6;
const MAX_SCALE = 2.2;

const clampScale = (scale: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

const wrap = (index: number, length: number) =>
  ((index % length) + length) % length;

// Read when a gesture lands, so turning the setting on applies at once;
// motion's useReducedMotion reads it only on mount.
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const GUIDE: ReadonlyArray<ReactNode> = [
  <>
    <b>Swipe</b> one finger sideways to page through the rooms. The card follows
    your finger and springs to the nearest one.
  </>,
  <>
    <b>Two-finger swipe</b> sideways to switch the accent colour.
  </>,
  <>
    <b>Hold one finger</b>, then swipe another: left finger holding counts up,
    right finger holding counts down.
  </>,
  <>
    <b>Pinch</b> to scale the current card.
  </>,
  <>
    <b>Double tap</b> to like the current room; <b>long press</b> for a small
    menu; <b>tap</b> to close it.
  </>,
  <>
    <b>Two-finger tap</b> resets everything. Scrolling up and down works as
    usual everywhere.
  </>,
];

function Gestures() {
  const [debug, setDebug] = useState(true);
  const [page, setPage] = useState(0);
  const [accent, setAccent] = useState(0);
  const [count, setCount] = useState(0);
  const [lastSide, setLastSide] = useState<string>('none');
  const [liked, setLiked] = useState<ReadonlySet<number>>(new Set());
  const [scales, setScales] = useState<ReadonlyArray<number>>(() =>
    ROOMS.map(() => 1),
  );
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [last, setLast] = useState('none yet');

  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const surfaceRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  // The carousel's offset in px, written straight to the track while a finger
  // or a spring moves it; React only learns the page it settles on.
  const offset = useRef(0);
  const pageRef = useRef(0);
  const drag = useRef({ base: 0, from: 0, width: 1 });
  const spring = useRef<{ stop: () => void } | undefined>(undefined);

  const place = (value: number) => {
    offset.current = value;
    if (trackRef.current !== null) {
      trackRef.current.style.transform = `translate3d(${value}px, 0, 0)`;
    }
  };

  const settleTo = (target: number, velocity: number) => {
    spring.current?.stop();
    const width = viewportRef.current?.clientWidth ?? 1;
    pageRef.current = target;
    setPage(target);
    spring.current = settle({
      from: offset.current,
      to: -target * width,
      velocity,
      instant: prefersReducedMotion(),
      onUpdate: place,
    });
  };

  // A resize moves the track straight to its page at the new width.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    let width = viewport.clientWidth;
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth === width) return;
      width = viewport.clientWidth;
      spring.current?.stop();
      place(-pageRef.current * width);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (menu === null) return;
    firstItemRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const resetAll = () => {
    settleTo(0, 0);
    setAccent(0);
    setCount(0);
    setLastSide('none');
    setLiked(new Set());
    setScales(ROOMS.map(() => 1));
    setMenu(null);
  };

  const toggleLike = () =>
    setLiked((previous) => {
      const next = new Set(previous);
      if (!next.delete(page)) next.add(page);
      return next;
    });

  const ripple = (x: number, y: number) => {
    const element = rippleRef.current;
    if (element === null || prefersReducedMotion()) return;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.45 },
        { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 },
      ],
      { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  };

  const onPan = (event: Extract<GestureEvent, { kind: 'pan' }>) => {
    const last = ROOMS.length - 1;
    if (event.phase === 'began') {
      spring.current?.stop();
      const width = viewportRef.current?.clientWidth ?? 1;
      drag.current = {
        base: offset.current,
        from: Math.round(-offset.current / width),
        width,
      };
    }
    const { base, from, width } = drag.current;
    if (event.phase === 'began' || event.phase === 'changed') {
      const raw = base + event.dx;
      const min = -last * width;
      place(
        raw > 0
          ? rubberBand(raw, width)
          : raw < min
            ? min - rubberBand(min - raw, width)
            : raw,
      );
      return;
    }
    if (event.phase === 'cancelled') {
      settleTo(from, 0);
      return;
    }
    const step = event.dx < 0 ? 1 : -1;
    const candidate = Math.min(last, Math.max(0, from + step));
    const commit =
      candidate !== from &&
      shouldCommit({
        progress: event.distance / width,
        velocity: event.velocity * -step,
      });
    settleTo(commit ? candidate : from, event.velocity);
  };

  const onPinch = (event: Extract<GestureEvent, { kind: 'pinch' }>) => {
    const scale = clampScale(scales[page] * event.scale);
    if (event.phase === 'ended') {
      setScales((previous) =>
        previous.map((value, index) => (index === page ? scale : value)),
      );
      return;
    }
    const surface = surfaceRefs.current[page];
    if (surface === null || surface === undefined) return;
    surface.style.transform = `scale(${event.phase === 'cancelled' ? scales[page] : scale})`;
  };

  const onGesture = (event: GestureEvent) => {
    switch (event.kind) {
      case 'pan':
        onPan(event);
        break;
      case 'pinch':
        onPinch(event);
        break;
      case 'two-finger-pan':
        if (event.phase === 'ended') {
          setAccent((previous) =>
            wrap(
              previous + (event.direction === 'left' ? 1 : -1),
              ACCENTS.length,
            ),
          );
        }
        break;
      case 'hold-swipe':
        if (event.phase === 'ended') {
          setCount(
            (previous) => previous + (event.side === 'left-holds' ? 1 : -1),
          );
          setLastSide(event.side);
        }
        break;
      case 'double-tap':
        toggleLike();
        break;
      case 'long-press':
        if (event.phase === 'began') setMenu({ x: event.x, y: event.y });
        break;
      case 'two-finger-tap':
        resetAll();
        break;
      case 'tap':
        if (menu === null) ripple(event.x, event.y);
        else setMenu(null);
        break;
    }
    if (event.phase === 'ended' || event.phase === 'cancelled') {
      setLast(`${event.kind} ${event.phase}`);
    }
  };

  const tint = ACCENTS[accent];

  return (
    <ScenarioPage
      id="gestures"
      title="Gestures"
      proves={
        <p>
          The content below is a Gesture Zone. Inside it the page owns touch
          input, except in a strip along each screen edge that stays with the
          browser or the OS, so swipe back keeps working. Scrolling up and down
          stays native. Use a phone, or a desktop browser with touch emulation.
        </p>
      }
      steps={GUIDE}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-h-11 items-center gap-3">
          <Switch
            id="gestures-debug"
            data-testid="gestures-debug-toggle"
            checked={debug}
            onCheckedChange={setDebug}
          />
          <Label htmlFor="gestures-debug">Debug overlay</Label>
        </div>
        <Button
          variant="outline"
          className="min-h-11 touch-manipulation sm:min-h-9"
          onClick={resetAll}
          data-testid="gestures-reset"
        >
          Reset
        </Button>
      </div>

      <GestureZone
        onGesture={onGesture}
        data-testid="gestures-zone"
        className="flex flex-col gap-8 rounded-xl"
        style={{ '--demo-accent': tint.color } as CSSProperties}
      >
        {debug ? <GestureDebugOverlay /> : null}
        <span
          ref={rippleRef}
          aria-hidden="true"
          className="pointer-events-none fixed z-40 size-16 rounded-full bg-(--demo-accent) opacity-0"
        />

        <section
          aria-label="Gesture playground"
          className="sticky top-14 z-10 -mx-1 flex flex-col gap-3 bg-background px-1 pt-2 pb-3"
        >
          <div
            ref={viewportRef}
            className="overflow-hidden rounded-xl ring-1 ring-foreground/10"
          >
            <div
              ref={trackRef}
              data-testid="gestures-track"
              className="flex will-change-transform"
            >
              {ROOMS.map((room, index) => (
                <div
                  key={room.name}
                  className="w-full shrink-0 p-3"
                  aria-hidden={index !== page}
                >
                  <div
                    ref={(node) => {
                      surfaceRefs.current[index] = node;
                    }}
                    style={{ transform: `scale(${scales[index]})` }}
                    className="relative flex h-36 flex-col justify-end gap-1 rounded-lg bg-(--demo-accent) p-4 text-white transition-[background-color] duration-200"
                  >
                    <HeartIcon
                      aria-label={liked.has(index) ? 'Liked' : 'Not liked'}
                      className={cn(
                        'absolute top-3 right-3 size-6 transition-[scale,fill] duration-200 ease-out motion-reduce:transition-none',
                        liked.has(index)
                          ? 'scale-110 fill-white'
                          : 'scale-100 fill-transparent',
                      )}
                    />
                    <p className="font-mono text-[11px] tracking-wider uppercase opacity-80">
                      Room {index + 1} of {ROOMS.length}
                    </p>
                    <p className="text-lg font-semibold">{room.name}</p>
                    <p className="text-sm opacity-90">{room.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5" aria-hidden>
            {ROOMS.map((room, index) => (
              <span
                key={room.name}
                className={cn(
                  'h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none',
                  index === page
                    ? 'w-5 bg-(--demo-accent)'
                    : 'w-1.5 bg-muted-foreground/40',
                )}
              />
            ))}
          </div>

          <dl className="grid grid-cols-3 gap-2 font-mono text-xs sm:grid-cols-6">
            <Stat
              label="Room"
              testId="gestures-page"
              value={`${page + 1}/${ROOMS.length}`}
            />
            <Stat label="Accent" testId="gestures-accent" value={tint.name} />
            <Stat
              label="Counter"
              testId="gestures-count"
              value={count > 0 ? `+${count}` : String(count)}
              hint={lastSide}
            />
            <Stat
              label="Scale"
              testId="gestures-scale"
              value={`×${scales[page].toFixed(2)}`}
            />
            <Stat
              label="Liked"
              testId="gestures-liked"
              value={liked.has(page) ? 'yes' : 'no'}
            />
            <Stat label="Last" testId="gestures-last" value={last} />
          </dl>
        </section>

        <Prose title="Why the edges are left alone">
          <p>
            In a Safari tab, a swipe that starts at the left edge goes back and
            one at the right edge goes forward. On Android, the system back
            gesture starts from either edge, in a tab or installed. If the page
            also reacted to those swipes, one movement would do two things, or
            the browser would take the touch away halfway through.
          </p>
          <p>
            So the Gesture Zone stops 24px short of each screen edge, and 32px
            on Android, where users can widen the back area. Turn on the debug
            overlay to see the strips and who owns them where you are.
          </p>
        </Prose>

        <Prose title="Scrolling stays native">
          <p>
            The zone sets <code>touch-action: pan-y</code>. Up-and-down movement
            with one finger is the browser&apos;s, with its momentum and rubber
            band. A drag that starts sideways is the page&apos;s. The first ten
            pixels decide which it is.
          </p>
          <p>
            When the browser decides a touch is a scroll after all, it sends a
            pointercancel, and whatever was under way is cancelled cleanly: the
            carousel springs back to where it was.
          </p>
        </Prose>

        <Prose title="How gestures are told apart">
          <p>
            Every recognizer watches every touch. The first one to be certain
            claims it and the others stand down. Some wait on purpose: a tap
            waits a moment to be sure it isn&apos;t the start of a double tap,
            and pinch waits to be sure you aren&apos;t holding one finger for a
            hold-swipe.
          </p>
          <p>
            A hold-swipe needs the held finger down for a quarter of a second
            before the other one moves. Put both down and move them at once and
            it is a pinch or a two-finger swipe instead.
          </p>
        </Prose>

        <Prose title="What is left out on purpose">
          <p>
            Three fingers cancel the touch: phones use them for system
            shortcuts. There is no two-finger vertical gesture, because two
            fingers moving up or down should scroll. Long press starts after
            half a second, so for a hold-swipe put the second finger down before
            then.
          </p>
          <p>
            Buttons and links inside the zone still work. A swipe that ends over
            one doesn&apos;t click it, and text fields keep their own touch
            handling.
          </p>
        </Prose>

        <Prose title="Installed or in a tab">
          <p>
            The middle of the screen belongs to the page everywhere, so every
            gesture here works the same in a browser tab and in the installed
            app. Only the edge strips change owner. In an installed iOS app
            there is no system edge swipe, so the edges are the app&apos;s, but
            they stay outside the zone for edge gestures like a sidebar.
          </p>
        </Prose>

        {menu === null ? null : (
          <div
            role="menu"
            aria-label="Room actions"
            data-gestures="off"
            data-testid="gestures-menu"
            className="fixed z-40 flex w-44 origin-top-left flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            style={{
              left: Math.min(menu.x, window.innerWidth - 184),
              top: Math.min(menu.y, window.innerHeight - 160),
            }}
          >
            <MenuItem
              ref={firstItemRef}
              onClick={() => {
                toggleLike();
                setMenu(null);
              }}
            >
              {liked.has(page) ? 'Unlike room' : 'Like room'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                setAccent((previous) => wrap(previous + 1, ACCENTS.length));
                setMenu(null);
              }}
            >
              Next accent
            </MenuItem>
            <MenuItem onClick={resetAll}>Reset everything</MenuItem>
          </div>
        )}
      </GestureZone>
    </ScenarioPage>
  );
}

function Stat(props: {
  readonly label: string;
  readonly testId: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted/50 px-2 py-1.5">
      <dt className="text-[10px] tracking-wider text-muted-foreground uppercase">
        {props.label}
      </dt>
      <dd data-testid={props.testId} className="truncate tabular-nums">
        {props.value}
      </dd>
      {props.hint === undefined ? null : (
        <dd
          data-testid={`${props.testId}-hint`}
          className="truncate text-[10px] text-muted-foreground"
        >
          {props.hint}
        </dd>
      )}
    </div>
  );
}

function Prose(props: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex max-w-[65ch] flex-col gap-3 text-[15px] leading-relaxed text-pretty">
      <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
      {props.children}
    </section>
  );
}

function MenuItem(props: {
  readonly ref?: Ref<HTMLButtonElement>;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      ref={props.ref}
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className="flex min-h-11 items-center rounded-md px-3 text-left transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
    >
      {props.children}
    </button>
  );
}
