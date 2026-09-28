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
import { bindTouchInput } from '../touch-input';
import type { Hold, Side } from '../zone-machine';
import { createHub, type Hub } from './hub';

const ZoneContext = createContext<Hub | undefined>(undefined);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

const useHoldOf = (hub: Hub): Hold =>
  useSyncExternalStore(hub.watchHold, hub.hold, () => 'none');

export type GestureZoneProps = ComponentProps<'div'> & {
  /**
   * Whether a finger held still while another acts becomes a Hold, on its
   * side of the acting finger. Off by default: two fingers are then always
   * a pinch.
   */
  readonly holds?: boolean;
};

// The glow along the zone's left or right edge while that Hold is on: a soft
// light in --gesture-hold (the foreground colour by default) that fades
// inward and towards the top and bottom. It slides in over a quarter of a
// second and fades fast when the Hold ends.
function HoldGlow(props: { readonly side: Side; readonly on: boolean }) {
  const { side, on } = props;
  const light = (percent: number) =>
    `color-mix(in oklab, var(--gesture-hold, var(--foreground)) ${percent}%, transparent)`;
  const inward = side === 'left' ? 'to right' : 'to left';
  const ends =
    'linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)';
  return (
    <div
      aria-hidden="true"
      data-slot="gesture-hold"
      data-side={side}
      data-active={on ? '' : undefined}
      className={cn(
        'pointer-events-none absolute inset-y-0 z-50 w-16 opacity-0 transition-[opacity,translate] duration-150 ease-out data-active:translate-x-0 data-active:opacity-100 data-active:duration-250',
        side === 'left' ? 'left-0 -translate-x-6' : 'right-0 translate-x-6',
      )}
      style={{
        background: `linear-gradient(${inward}, ${light(30)} 0, ${light(12)} 30%, ${light(4)} 60%, transparent 100%)`,
        boxShadow: `inset ${side === 'left' ? 2 : -2}px 0 0 ${light(45)}`,
        maskImage: ends,
        WebkitMaskImage: ends,
      }}
    />
  );
}

/**
 * The screen's Gesture Zone: the app owns touch in it, and any component
 * inside, shown or hidden, reads its Gestures with `useGesture`, `useSwipe`
 * and `useTap`. With `holds`, a finger held still while another acts is a
 * Hold. There is one per screen: zones do not nest. It sets `data-state` to
 * the zone machine's state, for debugging.
 */
export function GestureZone({
  className,
  ref,
  children,
  holds = false,
  ...props
}: GestureZoneProps) {
  if (useContext(ZoneContext) !== undefined) {
    throw new Error(
      'GestureZone cannot be nested: use one per screen and read it with useGesture, useSwipe or useTap anywhere inside.',
    );
  }
  const allowed = useRef(holds);
  useLayoutEffect(() => {
    allowed.current = holds;
  });
  const [hub] = useState(() => createHub({ holds: () => allowed.current }));
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const hold = useHoldOf(hub);

  useEffect(() => {
    if (element === null) return;
    const unbind = bindTouchInput(element, hub.sink);
    const show = () => {
      element.dataset.state = hub.state();
    };
    show();
    const unwatch = hub.watch(show);
    return () => {
      unwatch();
      unbind();
    };
  }, [hub, element]);

  const attach = useCallback(
    (next: HTMLDivElement | null) => {
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
        {holds && (
          <>
            <HoldGlow side="left" on={hold === 'left'} />
            <HoldGlow side="right" on={hold === 'right'} />
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
