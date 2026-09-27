import { createFileRoute, Link } from '@tanstack/react-router';
import {
  coast,
  GestureDebugOverlay,
  type GestureEvent,
  GestureFingers,
  GestureZone,
  rubberBand,
} from 'kui-toolkit/components/blocks/gestures';
import { Button, buttonVariants } from 'kui-toolkit/components/ui/button';
import {
  ArrowLeftIcon,
  BugIcon,
  CircleDotIcon,
  MagnetIcon,
} from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react';
import { createField, type Field, type FieldState } from './-gestures/field.ts';
import { Instructions } from './-gestures/instructions.tsx';

export const Route = createFileRoute('/gestures')({
  staticData: { chrome: 'bare' },
  component: Gestures,
});

type Channel = 'flow' | 'pull' | 'size' | 'spin' | 'hue';
type Slid = Extract<Channel, 'pull' | 'size'>;

// Every channel is kept in finger pixels, so a flick coasts alike in all of
// them; `show` maps the value onto the Field.
const RANGE_PX = 240;
const DETENT_PX = RANGE_PX / 10;
const SPIN_PX = 90;
const HUE_PX = 160;
// How long a slider stays up after its value comes to rest.
const SLIDER_LINGER_MS = 700;
const STATUS_LINGER_MS = 1400;

const CHANNELS: Record<
  Channel,
  {
    readonly bounded: boolean;
    readonly show: (state: FieldState, value: number) => void;
  }
> = {
  flow: {
    bounded: false,
    show: (state, value) => {
      state.flow = value;
    },
  },
  pull: {
    bounded: true,
    show: (state, value) => {
      state.pull = value / RANGE_PX;
    },
  },
  size: {
    bounded: true,
    show: (state, value) => {
      state.size = value / RANGE_PX;
    },
  },
  spin: {
    bounded: false,
    show: (state, value) => {
      state.spin = value / SPIN_PX;
    },
  },
  hue: {
    bounded: false,
    show: (state, value) => {
      state.hue = value / HUE_PX;
    },
  },
};

/** What a Chord drives: by the Anchor's side, then the acting finger's axis. */
const CHORD_CHANNEL = {
  left: { vertical: 'pull', horizontal: 'spin' },
  right: { vertical: 'size', horizontal: 'hue' },
} as const;

// Placeholder content for the zone; `row` is the one that scrolls sideways.
const BLOCKS = [132, 72, 168, 'row', 96, 208, 80, 144, 64, 184, 112] as const;

// Read when a gesture lands, so turning the setting on applies at once;
// motion's useReducedMotion reads it only on mount.
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A short tick when an Anchor locks and at each detent. Android only: iOS
// has no Vibration API.
const buzz = () => {
  if (!prefersReducedMotion() && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
};

const share = (value: number) => Math.min(1, Math.max(0, value / RANGE_PX));

/** A bounded value dragged past 0 or the full range gives ground slowly. */
const band = (value: number) =>
  value < 0
    ? -rubberBand(-value, RANGE_PX)
    : value > RANGE_PX
      ? RANGE_PX + rubberBand(value - RANGE_PX, RANGE_PX)
      : value;

function Gestures() {
  const [debug, setDebug] = useState(false);
  const fieldElementRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const sliderRefs = useRef<Record<Slid, HTMLDivElement | null>>({
    pull: null,
    size: null,
  });
  const field = useRef<Field | undefined>(undefined);
  const values = useRef<Record<Channel, number>>({
    flow: 0,
    pull: 0,
    size: 0.3 * RANGE_PX,
    spin: 0,
    hue: 0,
  });
  const runs = useRef<Partial<Record<Channel, { stop: () => void }>>>({});
  const drag = useRef<{ channel: Channel; base: number } | undefined>(
    undefined,
  );
  const timers = useRef<Partial<Record<Slid | 'status', number>>>({});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const created = createField(canvas, prefersReducedMotion);
    field.current = created;
    for (const channel of Object.keys(CHANNELS) as Array<Channel>) {
      set(channel, values.current[channel]);
    }
    const observer = new ResizeObserver(() => created.invalidate());
    observer.observe(canvas);
    const running = runs.current;
    return () => {
      observer.disconnect();
      for (const run of Object.values(running)) run?.stop();
      created.destroy();
      field.current = undefined;
    };
  }, []);

  const set = (channel: Channel, value: number) => {
    const before = values.current[channel];
    values.current[channel] = value;
    fieldElementRef.current?.setAttribute(`data-${channel}`, value.toFixed(0));
    if (field.current !== undefined) {
      CHANNELS[channel].show(field.current.state, value);
      field.current.invalidate();
    }
    if (channel !== 'pull' && channel !== 'size') return;
    const fill = sliderRefs.current[channel]?.firstElementChild;
    if (fill instanceof HTMLElement) {
      fill.style.transform = `scaleY(${share(value)})`;
    }
    const detent = (v: number) => Math.round(share(v) * 10);
    if (detent(before) !== detent(value)) buzz();
  };

  const say = (text: string) => {
    const status = statusRef.current;
    if (status === null) return;
    window.clearTimeout(timers.current.status);
    status.textContent = text;
    status.dataset.active = '';
  };
  const quiet = () => {
    timers.current.status = window.setTimeout(() => {
      delete statusRef.current?.dataset.active;
    }, STATUS_LINGER_MS);
  };

  const showSlider = (channel: Channel, open: boolean) => {
    if (channel !== 'pull' && channel !== 'size') return;
    window.clearTimeout(timers.current[channel]);
    const slider = sliderRefs.current[channel];
    if (open) slider?.setAttribute('data-open', '');
    else slider?.removeAttribute('data-open');
  };

  const grab = (channel: Channel) => {
    runs.current[channel]?.stop();
    drag.current = { channel, base: values.current[channel] };
    showSlider(channel, true);
  };
  const follow = (travel: number) => {
    const current = drag.current;
    if (current === undefined) return;
    const raw = current.base + travel;
    set(current.channel, CHANNELS[current.channel].bounded ? band(raw) : raw);
  };
  /** Lets go of the dragged channel: it coasts on with `velocity` (px/ms). */
  const release = (velocity: number) => {
    const current = drag.current;
    drag.current = undefined;
    if (current === undefined) return;
    const { channel } = current;
    const run = coast({
      from: values.current[channel],
      velocity,
      ...(CHANNELS[channel].bounded
        ? { min: 0, max: RANGE_PX, snap: DETENT_PX }
        : {}),
      instant: prefersReducedMotion(),
      onUpdate: (value) => set(channel, value),
    });
    runs.current[channel] = run;
    void run.finished.then(() => {
      if (channel !== 'pull' && channel !== 'size') return;
      if (drag.current?.channel === channel) return;
      timers.current[channel] = window.setTimeout(
        () => showSlider(channel, false),
        SLIDER_LINGER_MS,
      );
    });
  };

  /** A zone point, placed at the same share of the Field. */
  const toField = (x: number, y: number) => {
    const zone = zoneRef.current?.getBoundingClientRect();
    const box = fieldElementRef.current?.getBoundingClientRect();
    if (zone === undefined || box === undefined) return { x: 0, y: 0 };
    return {
      x: ((x - zone.left) / zone.width) * box.width,
      y: ((y - zone.top) / zone.height) * box.height,
    };
  };

  const onPan = (event: Extract<GestureEvent, { kind: 'pan' }>) => {
    if (event.phase === 'began') grab('flow');
    if (event.phase === 'began' || event.phase === 'changed') {
      follow(event.dx);
      say(`pan · ${event.dx < 0 ? '←' : '→'} flow`);
      return;
    }
    release(event.phase === 'ended' ? event.velocity : 0);
    quiet();
  };

  const onChord = (event: Extract<GestureEvent, { kind: 'chord' }>) => {
    const scene = field.current;
    if (scene === undefined) return;
    const who = `chord · ${event.side} anchor`;
    if (event.phase === 'ended' || event.phase === 'cancelled') {
      scene.state.anchor = undefined;
      scene.invalidate();
      fieldElementRef.current?.removeAttribute('data-anchor');
      const vertical = event.axis === 'vertical';
      release(
        event.phase === 'cancelled'
          ? 0
          : vertical
            ? -event.velocity
            : event.velocity,
      );
      quiet();
      return;
    }
    const anchor = toField(event.anchor.x, event.anchor.y);
    scene.state.anchor = anchor;
    scene.invalidate();
    if (event.phase === 'began') {
      fieldElementRef.current?.setAttribute('data-anchor', event.side);
      buzz();
      say(who);
      return;
    }
    if (event.axis === undefined) return;
    const channel = CHORD_CHANNEL[event.side][event.axis];
    if (drag.current?.channel !== channel) {
      grab(channel);
      if (channel === 'pull') scene.state.pullAt = anchor;
      if (channel === 'spin') scene.state.spinAt = anchor;
    }
    const vertical = event.axis === 'vertical';
    follow(vertical ? -event.dy : event.dx);
    const arrow = vertical
      ? event.dy < 0
        ? '↑'
        : '↓'
      : event.dx < 0
        ? '←'
        : '→';
    const amount = CHANNELS[channel].bounded
      ? ` ${Math.round(share(values.current[channel]) * 100)}%`
      : '';
    say(`${who} · ${arrow} ${channel}${amount}`);
  };

  const onGesture = (event: GestureEvent) => {
    switch (event.kind) {
      case 'tap':
        field.current?.ripple(toField(event.x, event.y));
        say('tap');
        quiet();
        break;
      case 'double-tap':
        field.current?.bloom(toField(event.x, event.y));
        say('double tap · bloom');
        quiet();
        break;
      case 'pan':
        onPan(event);
        break;
      case 'chord':
        onChord(event);
        break;
    }
  };

  const iconButton = 'size-11 touch-manipulation text-foreground/80';

  return (
    <main
      data-page
      data-testid="scenario-gestures"
      className="fixed inset-x-0 top-0 flex h-dvh flex-col overflow-hidden bg-background"
    >
      <section
        ref={fieldElementRef}
        aria-label="Field"
        data-testid="gestures-field"
        className="dark relative h-[40%] shrink-0 overflow-hidden bg-background text-foreground"
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 size-full"
        />
        <Slider
          ref={(node) => {
            sliderRefs.current.pull = node;
          }}
          label="Pull"
          icon={<MagnetIcon />}
          className="right-[max(1rem,env(safe-area-inset-right))]"
        />
        <Slider
          ref={(node) => {
            sliderRefs.current.size = node;
          }}
          label="Size"
          icon={<CircleDotIcon />}
          className="left-[max(1rem,env(safe-area-inset-left))]"
        />
        <div className="absolute inset-x-0 top-0 flex justify-between pt-[max(0.25rem,env(safe-area-inset-top))] pr-[max(0.25rem,env(safe-area-inset-right))] pl-[max(0.25rem,env(safe-area-inset-left))]">
          <Link
            to="/"
            aria-label="Back to the overview"
            data-testid="gestures-back"
            className={buttonVariants({
              variant: 'ghost',
              size: 'icon',
              className: iconButton,
            })}
          >
            <ArrowLeftIcon aria-hidden="true" />
          </Link>
          <Instructions className={iconButton} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-end pr-[max(0.25rem,env(safe-area-inset-right))] pb-1 pl-[max(0.25rem,env(safe-area-inset-left))]">
          <p
            ref={statusRef}
            data-testid="gestures-status"
            className="pointer-events-none absolute inset-x-14 bottom-3.5 truncate text-center font-mono text-xs text-muted-foreground opacity-0 transition-opacity duration-300 data-active:opacity-100 data-active:duration-100 motion-reduce:transition-none"
          />
          <Button
            variant="ghost"
            size="icon"
            className={cn(iconButton, debug && 'bg-muted')}
            aria-label="Debug overlay"
            aria-pressed={debug}
            data-testid="gestures-debug-toggle"
            onClick={() => setDebug((on) => !on)}
          >
            <BugIcon aria-hidden="true" />
          </Button>
        </div>
      </section>

      <GestureZone
        ref={zoneRef}
        onGesture={onGesture}
        data-testid="gestures-zone"
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]"
      >
        <GestureFingers />
        {debug ? <GestureDebugOverlay /> : null}
        <div className="flex flex-col gap-3 pt-4">
          {BLOCKS.map((block, index) =>
            block === 'row' ? (
              <SidewaysRow key={index} />
            ) : (
              <div
                key={index}
                className="rounded-xl bg-muted"
                style={{ height: block }}
              />
            ),
          )}
        </div>
      </GestureZone>
    </main>
  );
}

/**
 * A tall pill slider, Control Center style, filled from the bottom. Hidden
 * until `data-open`; the page writes its fill's `scaleY` directly.
 */
function Slider(props: {
  readonly ref: Ref<HTMLDivElement>;
  readonly label: string;
  readonly icon: ReactNode;
  readonly className: string;
}) {
  return (
    <div
      ref={props.ref}
      role="img"
      aria-label={props.label}
      data-testid={`gestures-slider-${props.label.toLowerCase()}`}
      className={cn(
        'pointer-events-none absolute top-1/2 h-[62%] w-14 -translate-y-1/2 scale-95 overflow-hidden rounded-[1.75rem] bg-muted/80 opacity-0 ring-1 ring-foreground/10 backdrop-blur-md transition-[opacity,scale] duration-200 ease-out data-open:scale-100 data-open:opacity-100 motion-reduce:transition-none',
        props.className,
      )}
    >
      <div className="absolute inset-0 origin-bottom bg-foreground" />
      <span className="absolute inset-x-0 bottom-3 flex justify-center text-foreground mix-blend-difference [&_svg]:size-5">
        {props.icon}
      </span>
    </div>
  );
}

function SidewaysRow() {
  return (
    <section
      aria-label="Scrolls sideways"
      className="flex flex-col gap-2 rounded-xl bg-muted py-3"
    >
      <h2 className="px-3 text-xs font-medium text-muted-foreground">
        Scrolls sideways
      </h2>
      <div
        data-testid="gestures-row"
        className="flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none]"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-20 w-28 shrink-0 snap-start rounded-lg bg-background/60"
          />
        ))}
      </div>
    </section>
  );
}
