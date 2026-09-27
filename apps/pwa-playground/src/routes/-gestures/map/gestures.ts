import {
  settle,
  usePan,
  usePinch,
  useSwipe,
  useTap,
} from 'kui-toolkit/components/blocks/gestures';
import { useMotionValue } from 'kui-toolkit/motion';
import { WORLD_PX } from './world.tsx';

const MAX_SCALE = 4;
const STEP = 2;

type Point = { readonly x: number; readonly y: number };
type Size = { readonly width: number; readonly height: number };

/**
 * A map. One finger pans it and coasts; a Pinch zooms around the fingers,
 * sharing the Pan's x, y and scale. Double tap zooms in a step, a
 * two-finger tap zooms out a step, a two-finger double tap fits the whole
 * map (Google Maps' conventions). A left Hold turns a tap into a pin; a
 * right Hold turns a Swipe up or down into a change of layer.
 */
export function useMapGestures(map: {
  readonly size: Size;
  readonly origin: () => Point;
  readonly onPin: (at: Point) => void;
  readonly onLayer: (step: 1 | -1) => void;
}) {
  const { size } = map;
  // The whole map fits the viewer at this scale; it may not zoom out further.
  const fitScale = Math.min(size.width, size.height) / WORLD_PX || 0.25;
  const scale = useMotionValue(0.5);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  /** The viewer point `at` on the map, in map px. */
  const toMap = (at: Point): Point => {
    const origin = map.origin();
    return {
      x: (at.x - origin.x - x.get()) / scale.get(),
      y: (at.y - origin.y - y.get()) / scale.get(),
    };
  };
  /** Springs to `next` scale, keeping the map point under `at` where it is. */
  const zoomAt = (next: number, at: Point) => {
    const target = Math.min(MAX_SCALE, Math.max(fitScale, next));
    const origin = map.origin();
    const point = toMap(at);
    void settle(scale, target);
    void settle(x, at.x - origin.x - point.x * target);
    void settle(y, at.y - origin.y - point.y * target);
  };
  const fit = () => {
    void settle(scale, fitScale);
    void settle(x, (size.width - fitScale * WORLD_PX) / 2);
    void settle(y, (size.height - fitScale * WORLD_PX) / 2);
  };

  // The map may move until its edge reaches the middle of the viewer.
  const bounds = () => {
    const span = scale.get() * WORLD_PX;
    return {
      left: size.width / 2 - span,
      right: size.width / 2,
      top: size.height / 2 - span,
      bottom: size.height / 2,
    };
  };

  usePan({ x, y, bounds });
  usePinch({ scale, x, y, min: fitScale, max: MAX_SCALE });
  useTap({ count: 2, onTap: ({ point }) => zoomAt(scale.get() * STEP, point) });
  useTap({
    fingers: 2,
    onTap: ({ point }) => zoomAt(scale.get() / STEP, point),
  });
  useTap({ fingers: 2, count: 2, onTap: fit });
  useTap({ hold: 'left', onTap: ({ point }) => map.onPin(toMap(point)) });
  useSwipe({
    hold: 'right',
    direction: 'up',
    distance: 80,
    onSwipe: () => map.onLayer(1),
  });
  useSwipe({
    hold: 'right',
    direction: 'down',
    distance: 80,
    onSwipe: () => map.onLayer(-1),
  });

  return { scale, x, y, fit };
}
