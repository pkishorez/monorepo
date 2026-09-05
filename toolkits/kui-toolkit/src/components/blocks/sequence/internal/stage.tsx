import type { ReactNode } from 'react';

import { AnimatePresence, LayoutGroup } from '#lib/motion';

/**
 * The render shell. Hosts the active frame inside a single stable component so
 * React reconciles frame-to-frame by position + type + key — giving free
 * `layout` animation for same-position elements. The `LayoutGroup` makes
 * `layoutId` matching work across frame boundaries (cross-container moves) and
 * `AnimatePresence` plays exit animations for elements that disappear between
 * frames.
 *
 * It deliberately does NOT key its children by frame index: doing so would
 * unmount the whole subtree on every advance and defeat the correspondence.
 */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <LayoutGroup>
      <AnimatePresence>{children}</AnimatePresence>
    </LayoutGroup>
  );
}
