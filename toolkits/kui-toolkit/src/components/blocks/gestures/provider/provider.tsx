import {
  type ComponentProps,
  createContext,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { cn } from '#lib/utils';
import type { Scroll } from '../engine';
import { useEnvironment } from './environment';
import { createHub, type Hub, runHub } from './hub';
import type { ZoneSource } from './tree';

export { useEnvironment } from './environment';
export { boxOf as zoneBox } from './hub';
export type { Hub } from './hub';
export type { TapMark, ZoneSource, ZoneView } from './tree';

const ZoneContext = createContext<Hub | undefined>(undefined);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

// The axis the browser keeps is the one it may scroll; nothing else pans.
const TOUCH_ACTION: Record<Scroll, string> = {
  x: 'touch-pan-x',
  y: 'touch-pan-y',
  none: 'touch-none',
};

type ZoneProps = ComponentProps<'div'> & {
  /** The axis the browser keeps for one finger with no Hold: `y` by default. */
  readonly scroll?: Scroll;
};

function Zone({
  parent,
  scroll = 'y',
  className,
  ref,
  ...props
}: ZoneProps & { readonly parent: Hub | undefined }) {
  const environment = useEnvironment();
  const [hub] = useState(() => createHub({ parent, scroll, environment }));

  useEffect(() => {
    hub.environment = environment;
    hub.registry.refresh();
  }, [hub, environment]);

  useEffect(() => {
    const element = hub.element;
    if (element === null) return;
    hub.scroll = scroll;
    return runHub(hub, element);
  }, [hub, scroll]);

  const setElement = useCallback(
    (node: HTMLDivElement | null) => {
      hub.element = node;
      assignRef(ref, node);
    },
    [hub, ref],
  );

  return (
    <ZoneContext value={hub}>
      <div
        ref={setElement}
        data-slot="gesture-zone"
        data-scroll={scroll}
        className={cn(
          TOUCH_ACTION[scroll],
          'overscroll-contain select-none [-webkit-touch-callout:none]',
          className,
        )}
        {...props}
      />
    </ZoneContext>
  );
}

/**
 * The app's root Gesture Zone, and the context every gesture hook reads. It
 * is a zone like any other: `scroll` is the axis the browser keeps for one
 * finger with no Hold (`y` by default; `none` keeps nothing), and the
 * browser's own pull to refresh and overscroll stay out. Render
 * `<GestureFingers />` or `<GestureDebugOverlay />` anywhere inside to show
 * every zone under it.
 */
export function GestureProvider(props: ZoneProps) {
  return <Zone {...props} parent={undefined} />;
}

/**
 * A region inside a `GestureProvider` with its own scroll rule. Zones nest:
 * a touch belongs to the innermost zone it starts in, which reads it by its
 * own `scroll`, and a gesture it has no hook for passes out to the zone
 * around it. Put a zone on the scrolling element itself, or inside it.
 */
export function GestureZone(props: ZoneProps) {
  return <Zone {...props} parent={useContext(ZoneContext)} />;
}

/** The nearest zone; hooks and layers throw a clear error outside one. */
export const useZone = (user: string): Hub => {
  const hub = useContext(ZoneContext);
  if (hub === undefined) {
    throw new Error(
      `${user} must be used inside a GestureProvider or GestureZone`,
    );
  }
  return hub;
};

const subscribeNothing = () => () => {};

/**
 * What the layers read from every zone under the nearest provider, or
 * nothing until it is on the client: layers are portalled to the body.
 */
export const useZoneSource = (user: string): ZoneSource | undefined => {
  const hub = useZone(user);
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  return mounted ? hub.tree.source : undefined;
};
