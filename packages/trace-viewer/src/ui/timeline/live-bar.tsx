import React from 'react';
import { motion, MotionValue } from '@monorepo/frontend/motion';
import { cn } from '@monorepo/frontend/utils';
import { TIMELINE_LAYOUT } from '../constants.js';
import { useEffectiveConfig } from '../controls/config.js';

export interface LiveBarProps {
  xTimelinePxs: MotionValue<number>;
  liveGapWidth: MotionValue<number>;
  liveGapContent: MotionValue<string>;
  showLiveGap: boolean;
  isLive: boolean;
  maxGapInPxs: number;
  hasActivity: boolean;
}

export const LiveBar = React.memo(function LiveBar({
  xTimelinePxs,
  liveGapWidth,
  isLive,
}: LiveBarProps) {
  const config = useEffectiveConfig();

  if (!config.enableLiveBar) return null;

  return (
    <motion.div
      className="flex w-min pointer-events-none"
      animate={{
        opacity: config.enableLiveBar ? 1 : 0,
      }}
      style={{
        x: xTimelinePxs,
        gridRow: 1,
        gridColumn: 1,
      }}
    >
      {config.enableLiveGap && (
        <motion.div
          style={{
            width: liveGapWidth,
          }}
        />
      )}
      <div
        className="flex flex-col justify-end items-center"
        style={{
          width: TIMELINE_LAYOUT.LIVEBAR_WIDTH,
          height: `calc(100% - ${20}px)`,
          marginTop: 10,
        }}
      >
        <motion.div
          layout="size"
          className={cn(
            'w-3 flex justify-center items-stretch h-full bg-primary/20 rounded-full',
          )}
        >
          <div
            className={cn('w-0 border border-dashed border-primary my-2', {
              'animate-pulse': isLive,
            })}
          />
        </motion.div>
      </div>
    </motion.div>
  );
});
