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

// The Hold Zone's shade while its Hold is on: the quarter circle itself,
// faintly tinted in --gesture-hold (the foreground colour by default), with
// a soft shadow round its edge. It waits 100ms, so a quick tap there never
// shows it, eases in over a quarter of a second, and fades fast when the
// Hold ends.
function HoldShade(props: {
  readonly side: Side;
  readonly radius: number;
  readonly on: boolean;
}) {
  const { side, radius, on } = props;
  const tint = (percent: number) =>
    `color-mix(in oklab, var(--gesture-hold, var(--foreground)) ${percent}%, transparent)`;
  return (
    <div
      aria-hidden="true"
      data-slot="gesture-hold"
      data-side={side}
      data-active={on ? '' : undefined}
      className={cn(
        'pointer-events-none absolute bottom-0 z-50 scale-90 opacity-0 transition-[opacity,scale] duration-150 ease-out data-active:scale-100 data-active:opacity-100 data-active:delay-100 data-active:duration-250',
        side === 'left'
          ? 'left-0 origin-bottom-left rounded-tr-full'
          : 'right-0 origin-bottom-right rounded-tl-full',
      )}
      style={{
        width: radius,
        height: radius,
        background: tint(5),
        boxShadow: `0 0 28px 2px rgb(0 0 0 / 0.28), inset 0 0 18px ${tint(8)}, inset 0 0 0 1px ${tint(10)}`,
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
            <HoldShade side="left" radius={holdRadius} on={hold === 'left'} />
            <HoldShade side="right" radius={holdRadius} on={hold === 'right'} />
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
