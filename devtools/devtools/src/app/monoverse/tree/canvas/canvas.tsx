import { useEffect, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from '@kestack/web-platform/ui/components/button';
import { HouseIcon, MinusIcon, PlusIcon } from 'lucide-react';

import type { Rect } from './geometry.js';
import { zoneAttribute } from './pointer-source.js';
import { useSpace, type Space } from './use-space.js';

/**
 * A pannable, zoomable space holding `children` at their own coordinates,
 * with zoom buttons in a corner. A click that lands on no row, and was not
 * the end of a drag, is `onEmptyClick`.
 */
export function Canvas({
  bounds,
  label,
  onEmptyClick,
  onSpace,
  children,
}: {
  bounds: Rect;
  label: string;
  onEmptyClick?: () => void;
  /** Hands out the camera, for whoever wants to move it. */
  onSpace?: (space: Space) => void;
  children: ReactNode;
}) {
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
      <div
        data-space-ignore
        className="absolute top-3 right-3 z-10 flex gap-0.5 rounded-lg bg-background/90 p-0.5 shadow-[0_0_0_1px_var(--color-border),0_2px_8px_-2px_rgb(0_0_0/0.15)] backdrop-blur-md"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-10"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => space.zoomBy(1 / 1.25)}
        >
          <MinusIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-10"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => space.zoomBy(1.25)}
        >
          <PlusIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:size-10"
          aria-label="Back to the top"
          title="Back to the top"
          onClick={() => space.home()}
        >
          <HouseIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
