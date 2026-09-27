import { useSwipe } from 'kui-toolkit/components/blocks/gestures';
import { useTransform } from 'kui-toolkit/motion';

export const SIDEBAR_WIDTH = 288;

/**
 * The lab's sidebar: one Swipe right anywhere on the lab's root zone. It stays
 * open at 1 until a Swipe left drags it back, and everything that moves is a
 * transform of its one `progress` value.
 */
export function useSidebarGestures() {
  const sidebar = useSwipe({
    direction: 'right',
    edge: false,
    after: 'stay',
    distance: SIDEBAR_WIDTH,
  });
  const { progress } = sidebar;
  return {
    ...sidebar,
    // The panel slides in from off screen, and stretches a little past open.
    panelX: useTransform(progress, [0, 1], [-SIDEBAR_WIDTH, 0]),
    scrimOpacity: useTransform(progress, [0, 1], [0, 0.4]),
    // Stop intercepting the next touch as soon as closing begins. This lets a
    // left close hand straight off to the right panel without a dead frame.
    scrimEvents: useTransform(progress, (value) =>
      value > 0.02 && progress.getVelocity() >= 0 ? 'auto' : 'none',
    ),
    // The lab behind gives way: pushed right and down in scale.
    contentX: useTransform(progress, [0, 1], [0, 40]),
    contentScale: useTransform(progress, [0, 1], [1, 0.94]),
    contentRadius: useTransform(progress, [0, 1], [0, 20]),
  };
}
