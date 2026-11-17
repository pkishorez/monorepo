import {
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Lamp as EngineLamp } from '../../core/index.ts';
import { LampsContext } from '../canvas/index.ts';

/*
 * A lamp is an element that gives off light: inside an <HtmlCanvas>, the
 * effects light what is around it in its colour, and it shows its own
 * colour exactly, as the light rather than lit. It is read from the DOM
 * every frame, so it can move, grow or hide like any element.
 *
 *   <Lamp color="#ff7a3d" intensity={1.4}><button>Deploy</button></Lamp>
 */

export type LampOptions = {
  /** `#rrggbb`. */
  readonly color?: string;
  readonly intensity?: number;
  /** How far its light reaches, in CSS px. */
  readonly reach?: number;
};

/**
 * Makes any element inside an <HtmlCanvas> a lamp: put the returned ref
 * on it. Effects read lamps from `u_lamps`.
 */
export const useLamp = <T extends Element>({
  color = '#ffb070',
  intensity = 1,
  reach = 240,
}: LampOptions = {}) => {
  const lamps = useContext(LampsContext);
  const [element, setElement] = useState<T | null>(null);
  const lamp =
    useRef<{ -readonly [K in keyof EngineLamp]: EngineLamp[K] }>(null);

  useEffect(() => {
    if (!lamps || !element) return;
    lamp.current = { element, color, intensity, reach };
    const remove = lamps.add(lamp.current);
    return () => {
      remove();
      lamp.current = null;
    };
    // Colour and strength are updated below without joining again.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [lamps, element]);

  useEffect(() => {
    if (!lamp.current) return;
    lamp.current.color = color;
    lamp.current.intensity = intensity;
    lamp.current.reach = reach;
  }, [color, intensity, reach]);

  return setElement;
};

/** A box that is a lamp: see `useLamp`. */
export function Lamp({
  children,
  className,
  style,
  ...options
}: LampOptions & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  const ref = useLamp<HTMLDivElement>(options);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
