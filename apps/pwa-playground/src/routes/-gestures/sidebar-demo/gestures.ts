import { useSwipe } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { useTransform } from '@kstackz/ui-toolkit/motion';

export const PANEL_WIDTH = 240;

/**
 * A second Swipe, on the demo's own zone: pulled in from anywhere toward
 * the left, the mirror of the lab's sidebar. A Swipe right on the demo, with
 * this panel closed, is not this zone's: it passes out to the sidebar.
 */
export function usePanelGestures() {
  const panel = useSwipe({
    direction: 'left',
    edge: false,
    after: 'stay',
    distance: PANEL_WIDTH,
  });
  return {
    ...panel,
    x: useTransform(panel.progress, [0, 1], [PANEL_WIDTH, 0]),
    scrimOpacity: useTransform(panel.progress, [0, 1], [0, 0.3]),
    scrimEvents: useTransform(panel.progress, (value) =>
      value > 0.02 && panel.progress.getVelocity() >= 0 ? 'auto' : 'none',
    ),
  };
}
