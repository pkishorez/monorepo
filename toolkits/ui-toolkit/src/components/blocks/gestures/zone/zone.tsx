import {
  type ComponentProps,
  createContext,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { cn } from '#lib/utils';
import { bindTouchInput } from '../touch-input';
import { createHub, type Hub } from './hub';

const ZoneContext = createContext<Hub | undefined>(undefined);

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
};

export type GestureZoneProps = ComponentProps<'div'>;

/**
 * The screen's Gesture Zone: every touch in it is the app's, and any
 * component inside, shown or hidden, reads its Gestures with `useGesture`
 * and `useSwipe`. There is one per screen: zones do not nest.
 */
export function GestureZone({
  className,
  ref,
  children,
  ...props
}: GestureZoneProps) {
  if (useContext(ZoneContext) !== undefined) {
    throw new Error(
      'GestureZone cannot be nested: use one per screen and read it with useGesture or useSwipe anywhere inside.',
    );
  }
  const [hub] = useState(createHub);
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (element === null) return;
    return bindTouchInput(element, hub.sink);
  }, [hub, element]);

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node);
      assignRef(ref, node);
    },
    [ref],
  );

  return (
    <ZoneContext value={hub}>
      <div
        ref={attach}
        data-slot="gesture-zone"
        className={cn(
          'overscroll-contain select-none [-webkit-touch-callout:none]',
          className,
        )}
        {...props}
      >
        {children}
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
