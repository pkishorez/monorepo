import {
  type ComponentProps,
  createContext,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { cn } from '#lib/utils';
import type { Point } from '../gesture-reading';
import { createHoldFeedback } from '../hold-feedback';
import { bindTouchInput } from '../touch-input';
import { HOLD_PRESS_MS } from '../zone-machine';
import { createHub, type HoldPhase, type Hub } from './hub';

const ZoneContext = createContext<Hub | undefined>(undefined);

// The Hold Zone's radius by default: 40% of the zone's width, up to 200px.
const HOLD_SHARE = 0.4;
const MAX_HOLD_RADIUS = 200;

// The ring filling around a finger pressing for the Hold.
const RING_RADIUS = 30;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

// The Hold Zone's radius: `radius`, or its share of `width`.
const reachOf = (width: number, radius: number | undefined) =>
  radius ?? Math.min(width * HOLD_SHARE, MAX_HOLD_RADIUS);

// Whether `point` lands in the quarter circle of `radius` on the element's
// bottom-left corner.
const inCorner = (
  element: Element | null,
  radius: number | undefined,
  point: Point,
) => {
  if (element === null) return false;
  const box = element.getBoundingClientRect();
  const reach = reachOf(box.width, radius);
  return Math.hypot(point.x - box.left, point.y - box.bottom) <= reach;
};

const usePhase = (hub: Hub): HoldPhase =>
  useSyncExternalStore(hub.watchPhase, hub.phase, () => 'off');

export type GestureZoneProps = ComponentProps<'div'> & {
  /**
   * The radius in px of the Hold Zone, a quarter circle on the bottom-left
   * corner: 40% of the zone's width, up to 200px, by default. It is live
   * only while some enabled listener takes Gestures under the Hold.
   */
  readonly holdRadius?: number;
  /**
   * Whether a Hold that took a press is confirmed: a short vibration where
   * the browser can vibrate (Android), a soft click where it cannot (iOS).
   * True by default.
   */
  readonly holdFeedback?: boolean;
};

// The Hold Zone lit up: a quarter circle on the bottom-left corner, glowing
// out from the corner. Faint while a finger there is ready to start the
// Hold or pressing for it, full while it is on. A soft light in
// --gesture-hold (the foreground colour by default) that comes in fast and
// fades out in 150ms.
function HoldGlow(props: {
  readonly phase: HoldPhase;
  readonly radius: number;
}) {
  const light = (percent: number) =>
    `color-mix(in oklab, var(--gesture-hold, var(--foreground)) ${percent}%, transparent)`;
  return (
    <div
      aria-hidden="true"
      data-slot="gesture-hold"
      data-phase={props.phase}
      data-active={props.phase === 'on' ? '' : undefined}
      className={cn(
        'pointer-events-none absolute bottom-0 left-0 z-50 origin-bottom-left scale-90 rounded-tr-full opacity-0 transition-[opacity,scale] duration-150 ease-out',
        props.phase !== 'off' && 'scale-100 duration-100',
        props.phase === 'armed' && 'opacity-60',
        props.phase === 'pressing' && 'opacity-40',
        props.phase === 'on' && 'opacity-100',
      )}
      style={{
        width: props.radius,
        height: props.radius,
        background: `radial-gradient(circle at bottom left, ${light(28)} 0, ${light(14)} 45%, ${light(4)} 85%, transparent 100%)`,
        boxShadow: `inset -1.5px 1.5px 0 ${light(40)}`,
      }}
    />
  );
}

// A ring around the pressing finger that fills over HOLD_PRESS_MS, so the
// wait for the Hold is never hidden.
function HoldRing(props: { readonly at: Point }) {
  const circle = useRef<SVGCircleElement>(null);
  useLayoutEffect(() => {
    const animation = circle.current?.animate(
      [{ strokeDashoffset: RING_LENGTH }, { strokeDashoffset: 0 }],
      { duration: HOLD_PRESS_MS, easing: 'linear', fill: 'forwards' },
    );
    return () => animation?.cancel();
  }, []);
  const size = 2 * (RING_RADIUS + 4);
  return (
    <svg
      aria-hidden="true"
      data-slot="gesture-hold-ring"
      width={size}
      height={size}
      className="pointer-events-none absolute z-50 -rotate-90"
      style={{ left: props.at.x - size / 2, top: props.at.y - size / 2 }}
    >
      <circle
        ref={circle}
        cx={size / 2}
        cy={size / 2}
        r={RING_RADIUS}
        fill="none"
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH}
        style={{
          stroke:
            'color-mix(in oklab, var(--gesture-hold, var(--foreground)) 60%, transparent)',
        }}
      />
    </svg>
  );
}

/**
 * The screen's Gesture Zone: the app owns touch in it, and any component
 * inside, shown or hidden, reads its Gestures with `useGesture`, `usePan`,
 * `useSwipe` and `useTap`. While some enabled listener takes Gestures under
 * the Hold, a finger in the bottom-left Hold Zone can start it. There is one
 * per screen: zones do not nest. It sets `data-state` to the zone machine's
 * state, for debugging.
 */
export function GestureZone({
  className,
  ref,
  children,
  holdRadius,
  holdFeedback = true,
  ...props
}: GestureZoneProps) {
  if (useContext(ZoneContext) !== undefined) {
    throw new Error(
      'GestureZone cannot be nested: use one per screen and read it with useGesture, usePan, useSwipe or useTap anywhere inside.',
    );
  }
  const node = useRef<HTMLDivElement | null>(null);
  const settings = useRef({ holdRadius, holdFeedback });
  useLayoutEffect(() => {
    settings.current = { holdRadius, holdFeedback };
  });
  const [feedback] = useState(() =>
    typeof document === 'undefined' ? undefined : createHoldFeedback(document),
  );
  const [hub] = useState(() =>
    createHub({
      inHoldZone: (point) =>
        inCorner(node.current, settings.current.holdRadius, point),
      onHold: (pressed) => {
        if (pressed && settings.current.holdFeedback) feedback?.tick();
      },
    }),
  );
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const phase = usePhase(hub);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (element === null) return;
    const unbind = bindTouchInput(element, hub.sink);
    const resizes = new ResizeObserver(() => setWidth(element.clientWidth));
    resizes.observe(element);
    const show = () => {
      element.dataset.state = hub.state();
    };
    show();
    const unwatchState = hub.watchState(show);
    // Browsers let sound start only as a finger lifts, so the click for the
    // next pressed Hold is unlocked then, on screens where one can happen.
    const unlock = () => {
      if (settings.current.holdFeedback && hub.holdTakesPress()) {
        feedback?.prepare();
      }
    };
    element.addEventListener('pointerup', unlock);
    element.addEventListener('touchend', unlock);
    return () => {
      element.removeEventListener('pointerup', unlock);
      element.removeEventListener('touchend', unlock);
      unwatchState();
      resizes.disconnect();
      unbind();
    };
  }, [hub, element, feedback]);

  useEffect(() => () => feedback?.dispose(), [feedback]);

  const attach = useCallback(
    (next: HTMLDivElement | null) => {
      node.current = next;
      setElement(next);
      assignRef(ref, next);
    },
    [ref],
  );

  // Where the pressing finger landed, in the zone's own px.
  const pressing = (() => {
    if (phase !== 'pressing' || element === null) return undefined;
    const box = element.getBoundingClientRect();
    const origin = hub.origin();
    return { x: origin.x - box.left, y: origin.y - box.top };
  })();

  return (
    <ZoneContext value={hub}>
      <div
        ref={attach}
        data-slot="gesture-zone"
        data-hold={phase === 'on' ? '' : undefined}
        className={cn(
          'relative overscroll-contain select-none [-webkit-touch-callout:none]',
          className,
        )}
        {...props}
      >
        {children}
        <HoldGlow phase={phase} radius={reachOf(width, holdRadius)} />
        {pressing !== undefined && <HoldRing at={pressing} />}
      </div>
    </ZoneContext>
  );
}

/** The Gesture Zone around; hooks throw a clear error outside one. */
export const useZone = (user: string): Hub => {
  const hub = useContext(ZoneContext);
  if (hub === undefined) {
    throw new Error(`${user} must be used inside a GestureZone`);
  }
  return hub;
};

/** Whether the Hold is on right now, as React state. */
export function useHold(): boolean {
  const hub = useZone('useHold');
  return useSyncExternalStore(hub.watchHold, hub.hold, () => false);
}
