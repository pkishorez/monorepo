import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import type { Rect } from './geometry.js';
import { zoneAttribute } from './pointer-source.js';
import { usePhone } from '../../ui/index.js';
import { ScrollCanvas } from './scroll-canvas.js';
import { useSpace, type CanvasControls } from './use-space.js';
import { ZoomControls } from './zoom-controls.js';

interface CanvasProps {
  bounds: Rect;
  label: string;
  onEmptyClick?: () => void;
  /** Hands out the camera, for whoever wants to move it. */
  onSpace?: (space: CanvasControls) => void;
  /** Buttons of the content's own, first in the corner. */
  controls?: ReactNode;
  children: ReactNode;
}

/**
 * A zoomable space holding `children` at their own coordinates, with zoom
 * buttons in a corner: panned by dragging on a wide screen, scrolled on a
 * phone, where a finger expects to scroll. A click that lands on no row,
 * and was not the end of a drag, is `onEmptyClick`.
 */
export function Canvas(props: CanvasProps) {
  const phone = usePhone();
  return phone ? <ScrollCanvas {...props} /> : <PanCanvas {...props} />;
}

function PanCanvas({
  bounds,
  label,
  onEmptyClick,
  onSpace,
  controls,
  children,
}: CanvasProps) {
  const reduced = useReducedMotion() ?? false;
  const space = useSpace(reduced);
  const { x, y, width, height } = bounds;

  useEffect(() => {
    space.setBounds({ x, y, width, height });
  }, [space, x, y, width, height]);
  useEffect(() => {
    onSpace?.(space);
  }, [space, onSpace]);

  return (
    <div
      ref={space.viewportRef}
      // The zone drags and pinches start in: without it no gesture is found.
      {...{ [zoneAttribute]: 'surface' }}
      role="tree"
      aria-label={label}
      className="relative h-full w-full touch-none overflow-hidden select-none"
      onClick={(event) => {
        if (!(event.target instanceof Element)) return;
        // Neither a node nor the canvas's own controls: empty space.
        if (event.target.closest('[data-row], [data-space-ignore]') === null)
          onEmptyClick?.();
      }}
    >
      <motion.div
        className="absolute top-0 left-0 origin-top-left"
        style={{ x: space.x, y: space.y, scale: space.zoom }}
      >
        {children}
      </motion.div>
      <ZoomControls
        onOut={() => space.zoomBy(1 / 1.25)}
        onIn={() => space.zoomBy(1.25)}
        onHome={() => space.home()}
      >
        {controls}
      </ZoomControls>
    </div>
  );
}
