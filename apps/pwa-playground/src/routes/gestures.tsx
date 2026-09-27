import { createFileRoute, Link } from '@tanstack/react-router';
import {
  coast,
  GestureDebugOverlay,
  type GestureEvent,
  GestureFingers,
  GestureZone,
  settle,
} from 'kui-toolkit/components/blocks/gestures';
import { Button, buttonVariants } from 'kui-toolkit/components/ui/button';
import { ArrowLeftIcon, BugIcon } from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import { useEffect, useRef, useState } from 'react';
import {
  createField,
  type Field,
  type Point,
  SPACING,
  toWorld,
} from './-gestures/field.ts';
import { Instructions } from './-gestures/instructions.tsx';

export const Route = createFileRoute('/gestures')({
  staticData: { chrome: 'bare' },
  component: Gestures,
});

type View = Field['state']['view'];
type Pan = Extract<GestureEvent, { kind: 'pan' }>;

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
// Finger travel, in Field px, that zooms by a factor of e.
const ZOOM_PX = 160;
const ZOOM_STEP = 1.5;
const FIT_MARGIN_PX = 40;
const STATUS_LINGER_MS = 1400;
const DEFAULT_VIEW: View = { x: 0, y: 0, scale: 1 };

// Placeholder content for the zone; `row` is the one that scrolls sideways.
const BLOCKS = [132, 72, 168, 'row', 96, 208, 80, 144, 64, 184, 112] as const;

// Read when a gesture lands, so turning the setting on applies at once;
// motion's useReducedMotion reads it only on mount.
const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A short tick when an Anchor locks. Android only: iOS has no Vibration API.
const buzz = () => {
  if (!prefersReducedMotion() && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8);
  }
};

const clampScale = (scale: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** `view` zoomed to `scale` about Field point `at`, which stays put. */
const zoomAbout = (view: View, at: Point, scale: number): View => {
  const k = scale / view.scale;
  return {
    x: at.x - (at.x - view.x) * k,
    y: at.y - (at.y - view.y) * k,
    scale,
  };
};

/** The view that shows every pin, or the default one when there are none. */
const fitPins = (
  pins: ReadonlyArray<Point>,
  box: { readonly width: number; readonly height: number },
): View => {
  if (pins.length === 0) return DEFAULT_VIEW;
  const xs = pins.map((pin) => pin.x);
  const ys = pins.map((pin) => pin.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const width = Math.max(...xs) - left;
  const height = Math.max(...ys) - top;
  const scale = clampScale(
    Math.min(
      (box.width - FIT_MARGIN_PX * 2) / Math.max(width, SPACING),
      (box.height - FIT_MARGIN_PX * 2) / Math.max(height, SPACING),
    ),
  );
  return {
    x: box.width / 2 - (left + width / 2) * scale,
    y: box.height / 2 - (top + height / 2) * scale,
    scale,
  };
};

const ACTION = {
  tap: 'tap',
  'double-tap': 'double tap',
  pan: 'pan',
} as const;

/** What each gesture did, for the status line. */
const DID = {
  none: { tap: 'light', 'double-tap': 'reset' },
  left: { tap: 'pin', 'double-tap': 'clear', pan: 'move' },
  right: { tap: 'zoom in', 'double-tap': 'fit', pan: 'zoom' },
} as const;

function Gestures() {
  const [debug, setDebug] = useState(false);
  const fieldElementRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const field = useRef<Field | undefined>(undefined);
  const runs = useRef<Array<{ stop: () => void }>>([]);
  const drag = useRef<{ view: View; at: Point } | undefined>(undefined);
  const statusTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const created = createField(canvas, prefersReducedMotion);
    field.current = created;
    const observer = new ResizeObserver(() => created.invalidate());
    observer.observe(canvas);
    const running = runs.current;
    return () => {
      observer.disconnect();
      for (const run of running) run.stop();
      created.destroy();
      field.current = undefined;
    };
  }, []);

  const show = (view: View) => {
    const scene = field.current;
    if (scene === undefined) return;
    scene.state.view = view;
    scene.invalidate();
    const element = fieldElementRef.current;
    if (element === null) return;
    element.dataset.x = view.x.toFixed(0);
    element.dataset.y = view.y.toFixed(0);
    element.dataset.scale = view.scale.toFixed(2);
    element.dataset.pins = String(scene.state.pins.length);
  };
  const view = () => field.current?.state.view ?? DEFAULT_VIEW;

  const stopRuns = () => {
    for (const run of runs.current) run.stop();
    runs.current = [];
  };

  /** Springs the view to `target`, carrying on from where it is. */
  const glide = (target: View) => {
    stopRuns();
    const from = view();
    const run = settle({
      from: 0,
      to: 1,
      velocity: 0,
      instant: prefersReducedMotion(),
      onUpdate: (k) =>
        show({
          x: from.x + (target.x - from.x) * k,
          y: from.y + (target.y - from.y) * k,
          scale: from.scale + (target.scale - from.scale) * k,
        }),
    });
    runs.current = [run];
  };

  /** Lets the view run on at the release speed, in Field px/ms. */
  const fling = (vx: number, vy: number) => {
    const instant = prefersReducedMotion();
    const make = (axis: 'x' | 'y', velocity: number) =>
      coast({
        from: view()[axis],
        velocity,
        instant,
        onUpdate: (value) => show({ ...view(), [axis]: value }),
      });
    runs.current = [make('x', vx), ...(vy === 0 ? [] : [make('y', vy)])];
  };

  const say = (text: string, done: boolean) => {
    const status = statusRef.current;
    if (status === null) return;
    window.clearTimeout(statusTimer.current);
    status.textContent = text;
    status.dataset.active = '';
    if (!done) return;
    statusTimer.current = window.setTimeout(() => {
      delete statusRef.current?.dataset.active;
    }, STATUS_LINGER_MS);
  };

  /** Zone px to Field px, per axis: the zone maps proportionally onto the Field. */
  const ratio = () => {
    const zone = zoneRef.current?.getBoundingClientRect();
    const box = fieldElementRef.current?.getBoundingClientRect();
    if (zone === undefined || box === undefined || zone.width === 0) {
      return { x: 1, y: 1, zone, box };
    }
    return {
      x: box.width / zone.width,
      y: box.height / zone.height,
      zone,
      box,
    };
  };
  /** A zone point, placed at the same share of the Field. */
  const toField = (x: number, y: number): Point => {
    const { zone, box } = ratio();
    if (zone === undefined || box === undefined) return { x: 0, y: 0 };
    return {
      x: ((x - zone.left) / zone.width) * box.width,
      y: ((y - zone.top) / zone.height) * box.height,
    };
  };

  const onPan = (event: Pan) => {
    const scale = ratio();
    const side = event.anchor?.side;
    if (event.phase === 'began') {
      stopRuns();
      drag.current = {
        view: view(),
        at:
          event.anchor === undefined
            ? { x: 0, y: 0 }
            : toField(event.anchor.x, event.anchor.y),
      };
    }
    const start = drag.current;
    if (start === undefined) return;
    const dx = event.dx * scale.x;
    const dy = event.dy * scale.y;
    if (event.phase === 'began' || event.phase === 'changed') {
      if (side === 'right') {
        const zoomed = clampScale(start.view.scale * Math.exp(-dy / ZOOM_PX));
        show(zoomAbout(start.view, start.at, zoomed));
        say(`right anchor · pan · zoom ${zoomed.toFixed(1)}×`, false);
      } else {
        show({ ...start.view, x: start.view.x + dx, y: start.view.y + dy });
        say(
          side === 'left' ? 'left anchor · pan · move' : 'swipe · scroll',
          false,
        );
      }
      return;
    }
    drag.current = undefined;
    if (event.phase === 'cancelled') {
      glide(start.view);
    } else if (side !== 'right') {
      fling(event.velocityX * scale.x, event.velocityY * scale.y);
    }
    say(
      side === undefined
        ? 'swipe · scroll'
        : `${side} anchor · pan · ${DID[side].pan}`,
      true,
    );
  };

  const onTap = (
    event: Extract<GestureEvent, { kind: 'tap' | 'double-tap' }>,
  ) => {
    const scene = field.current;
    if (scene === undefined) return;
    const side = event.anchor?.side ?? 'none';
    const at = toField(event.x, event.y);
    const anchorAt =
      event.anchor === undefined ? at : toField(event.anchor.x, event.anchor.y);
    const box = fieldElementRef.current?.getBoundingClientRect() ?? {
      width: 0,
      height: 0,
    };
    if (event.kind === 'tap') {
      if (side === 'none') scene.light(at);
      if (side === 'left') {
        scene.state.pins.push(toWorld(scene.state, at));
        show(view());
      }
      if (side === 'right') {
        glide(
          zoomAbout(view(), anchorAt, clampScale(view().scale * ZOOM_STEP)),
        );
      }
    } else {
      if (side === 'none') glide(DEFAULT_VIEW);
      if (side === 'left') {
        scene.state.pins = [];
        show(view());
      }
      if (side === 'right') glide(fitPins(scene.state.pins, box));
    }
    const who = side === 'none' ? '' : `${side} anchor · `;
    say(`${who}${ACTION[event.kind]} · ${DID[side][event.kind]}`, true);
  };

  const onAnchor = (event: Extract<GestureEvent, { kind: 'anchor' }>) => {
    const scene = field.current;
    if (scene === undefined) return;
    const element = fieldElementRef.current;
    if (event.phase === 'locked') {
      scene.state.anchor = {
        at: toField(event.x, event.y),
        side: event.side,
      };
      element?.setAttribute('data-anchor', event.side);
      buzz();
      say(
        `${event.side} anchor · ${event.side === 'left' ? 'Move' : 'Zoom'}`,
        false,
      );
    } else {
      scene.state.anchor = undefined;
      element?.removeAttribute('data-anchor');
      say(`${event.side} anchor ${event.phase}`, true);
    }
    scene.invalidate();
  };

  const onGesture = (event: GestureEvent) => {
    switch (event.kind) {
      case 'tap':
      case 'double-tap':
        onTap(event);
        break;
      case 'pan':
        onPan(event);
        break;
      case 'anchor':
        onAnchor(event);
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
            className="pointer-events-none absolute inset-x-14 bottom-3 mx-auto w-fit max-w-[calc(100%-7rem)] truncate rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-xs text-foreground/80 opacity-0 backdrop-blur-sm transition-opacity duration-300 data-active:opacity-100 data-active:duration-100 motion-reduce:transition-none"
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
        {debug ? (
          <GestureDebugOverlay machineClassName="inset-x-2 top-[max(3rem,calc(env(safe-area-inset-top)+2.75rem))] h-[calc(40dvh-6.5rem-env(safe-area-inset-top))]" />
        ) : null}
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
