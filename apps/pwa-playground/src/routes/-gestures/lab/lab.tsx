import { useSyncExternalStore } from 'react';
import { GestureZone } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { TabBar, TopBar } from './bars.tsx';
import { DEMOS, type DemoId } from './demos.ts';

export { parseDemo } from './demos.ts';
export type { DemoId } from './demos.ts';

// The Hold Zones on the bottom corners: just under half the screen's width
// each, so they never meet, up to a size that leaves most of a wide screen
// alone. A quick tap on them is still an ordinary tap.
const HOLD_SHARE = 0.48;
const MAX_HOLD_RADIUS = 200;

const watchWidth = (change: () => void) => {
  window.addEventListener('resize', change);
  return () => window.removeEventListener('resize', change);
};

const useHoldRadius = () =>
  Math.min(
    useSyncExternalStore(
      watchWidth,
      () => window.innerWidth,
      () => 0,
    ) * HOLD_SHARE,
    MAX_HOLD_RADIUS,
  );

/**
 * The Gesture Lab, full screen: one Gesture Zone around everything, with a
 * Hold Zone on each bottom corner, a top bar, the demo, and a tab bar. `demo` is the one showing; `onDemo` switches.
 */
export function GestureLab(props: {
  readonly demo: DemoId;
  readonly onDemo: (demo: DemoId) => void;
}) {
  const { Screen } = DEMOS[props.demo];
  const holdRadius = useHoldRadius();
  return (
    <GestureZone
      data-testid="lab"
      data-demo={props.demo}
      holdRadius={holdRadius}
      className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <TopBar demo={props.demo} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Screen key={props.demo} />
      </main>
      <TabBar demo={props.demo} onDemo={props.onDemo} />
    </GestureZone>
  );
}
