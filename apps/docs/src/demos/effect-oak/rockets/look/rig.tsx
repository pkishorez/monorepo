import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { SHIP, STRAP } from './shapes.js';

/**
 * A rocket's box, the same in every Look: its height, its boosters strapped
 * to either side, the right one mirrored, and the `layoutId` it glides by.
 */
export const Rig = ({
  height,
  layoutId,
  boosters,
  children,
}: {
  readonly height: number;
  readonly layoutId?: string;
  readonly boosters?: ReadonlyArray<ReactNode>;
  /** The rocket itself, drawn over its boosters. */
  readonly children: ReactNode;
}) => (
  <motion.div
    layoutId={layoutId}
    className="relative shrink-0"
    style={{ height, width: height * SHIP.aspect }}
  >
    {boosters?.map((booster, index) => (
      <div
        key={index}
        className="absolute"
        style={{
          [index === 0 ? 'left' : 'right']: STRAP.side,
          top: STRAP.top,
          width: STRAP.width,
          height: STRAP.height,
          scale: index === 0 ? undefined : '-1 1',
        }}
      >
        {booster}
      </div>
    ))}
    <div className="relative size-full">{children}</div>
  </motion.div>
);
