import { useSidebar } from '@kstackz/use-gesture';
import { useSwipe } from '@kstackz/use-gesture/recognizers';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useStageStatus } from '../../stage/index.ts';

const WIDTH = 240;

type Release = { readonly offset: number; readonly velocity: number };

/**
 * A sidebar that settles by where the finger's momentum would carry it, so a
 * fast flick of a few px opens it. A Swipe that only listens alongside it
 * reports how far and how fast each release was.
 */
export function Flick() {
  const sidebar = useSidebar({ side: 'left', width: WIDTH });
  const [release, setRelease] = useState<Release>();
  const record = (at?: Release) =>
    setRelease(
      at && {
        offset: Math.round(at.offset),
        velocity: Math.round(at.velocity),
      },
    );
  useSwipe({
    enabled: !sidebar.open,
    direction: 'right',
    onCommit: record,
    onCancel: (_reason, at) => record(at),
  });
  const state = sidebar.open ? 'open' : 'closed';
  useStageStatus(
    sidebar.dragging
      ? 'dragging'
      : release
        ? `${state} · ${release.offset}px at ${release.velocity}px/s`
        : sidebar.open
          ? state
          : undefined,
  );

  return (
    <>
      <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
        Flick right
      </div>
      <motion.div
        className="absolute inset-0 bg-black/40"
        style={{
          opacity: sidebar.progress,
          pointerEvents: sidebar.open ? 'auto' : 'none',
        }}
        onClick={() => sidebar.setOpen(false)}
      />
      <motion.aside
        className="absolute inset-y-0 left-0 flex flex-col gap-2 bg-sidebar p-4 text-sm shadow-xl"
        style={{ width: WIDTH, x: sidebar.x }}
      >
        <span className="font-medium">Sidebar</span>
        <span className="text-muted-foreground">Flick left to close</span>
      </motion.aside>
    </>
  );
}
