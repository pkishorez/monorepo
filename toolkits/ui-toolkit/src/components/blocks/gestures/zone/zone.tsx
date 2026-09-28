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
import type { Hold, Side } from '../hold-reading';
import { bindTouchInput } from '../touch-input';
import { createHub, type Hub } from './hub';

const ZoneContext = createContext<Hub | undefined>(undefined);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

// The Hold Zone `point` lands in: a quarter circle of `radius` on each of
// the element's bottom corners.
const cornerOf = (
  element: Element | null,
  radius: number | undefined,
  point: Point,
): Side | undefined => {
  if (element === null || radius === undefined || radius <= 0) return undefined;
  const box = element.getBoundingClientRect();
  const within = (x: number) =>
    Math.hypot(point.x - x, point.y - box.bottom) <= radius;
  if (within(box.left)) return 'left';
  if (within(box.right)) return 'right';
  return undefined;
};

const useHoldOf = (hub: Hub): Hold =>
  useSyncExternalStore(hub.watchHold, hub.hold, () => 'none');

export type GestureZoneProps = ComponentProps<'div'> & {
  /**
   * The radius in px of the Hold Zones, a quarter circle on each bottom
   * corner. Without it the zone has no Hold Zones.
   */
  readonly holdRadius?: number;
};

// The glow on a Hold Zone while its Hold is on: a gradient from the corner
// out to a bright rim, in --gesture-hold-from and --gesture-hold-to.
function HoldGlow(props: {
  readonly side: Side;
  readonly radius: number;
  readonly on: boolean;
}) {
  const { side, radius, on } = props;
  const corner = side === 'left' ? '0 100%' : '100% 100%';
  const from = (percent: number) =>
    `color-mix(in oklab, var(--gesture-hold-from, var(--chart-9)) ${percent}%, transparent)`;
  const to = (percent: number) =>
    `color-mix(in oklab, var(--gesture-hold-to, var(--chart-6)) ${percent}%, transparent)`;
  return (
    <div
      aria-hidden="true"
      data-slot="gesture-hold"
      data-side={side}
      data-active={on ? '' : undefined}
      className={cn(
        'pointer-events-none absolute bottom-0 z-50 opacity-0 transition-opacity duration-300 data-active:opacity-100 data-active:duration-75',
        side === 'left' ? 'left-0' : 'right-0',
      )}
      style={{
        width: radius,
        height: radius,
        background: `radial-gradient(circle ${radius}px at ${corner}, ${from(70)} 0, ${to(35)} ${radius * 0.7}px, ${to(15)} ${radius - 3}px, ${to(85)} ${radius - 1.5}px, transparent ${radius}px)`,
      }}
    />
  );
}

/**
 * The screen's Gesture Zone: the app owns touch in it, and any component
 * inside, shown or hidden, reads its Gestures with `useGesture`, `useSwipe`
 * and `useTap`. With `holdRadius`, a finger on a bottom corner is a Hold. There
 * is one per screen: zones do not nest.
 */
export function GestureZone({
  className,
  ref,
  children,
  holdRadius,
  ...props
}: GestureZoneProps) {
  if (useContext(ZoneContext) !== undefined) {
    throw new Error(
      'GestureZone cannot be nested: use one per screen and read it with useGesture, useSwipe or useTap anywhere inside.',
    );
  }
  const node = useRef<HTMLDivElement | null>(null);
  const radius = useRef(holdRadius);
  useLayoutEffect(() => {
    radius.current = holdRadius;
  });
  const [hub] = useState(() =>
    createHub({
      holdAt: (point) => cornerOf(node.current, radius.current, point),
    }),
  );
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const hold = useHoldOf(hub);

  useEffect(() => {
    if (element === null) return;
    return bindTouchInput(element, hub.sink);
  }, [hub, element]);

  const attach = useCallback(
    (next: HTMLDivElement | null) => {
      node.current = next;
      setElement(next);
      assignRef(ref, next);
    },
    [ref],
  );

  return (
    <ZoneContext value={hub}>
      <div
        ref={attach}
        data-slot="gesture-zone"
        data-hold={hold === 'none' ? undefined : hold}
        className={cn(
          'relative overscroll-contain select-none [-webkit-touch-callout:none]',
          className,
        )}
        {...props}
      >
        {children}
        {holdRadius !== undefined && holdRadius > 0 && (
          <>
            <HoldGlow side="left" radius={holdRadius} on={hold === 'left'} />
            <HoldGlow side="right" radius={holdRadius} on={hold === 'right'} />
          </>
        )}
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

/** Which Hold is on right now, as React state: `none` when there is none. */
export function useHold(): Hold {
  return useHoldOf(useZone('useHold'));
}
