import { GestureZone } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { TabBar, TopBar } from './bars.tsx';
import { DEMOS, type DemoId } from './demos.ts';

export { parseDemo } from './demos.ts';
export type { DemoId } from './demos.ts';

// The Hold Zones on the bottom corners; the tab bar leaves them free.
const HOLD_RADIUS = 88;

/**
 * The Gesture Lab, full screen: one Gesture Zone around everything, with a
 * Hold Zone on each bottom corner, a top bar, the demo, and a tab bar. `demo` is the one showing; `onDemo` switches.
 */
export function GestureLab(props: {
  readonly demo: DemoId;
  readonly onDemo: (demo: DemoId) => void;
}) {
  const { Screen } = DEMOS[props.demo];
  return (
    <GestureZone
      data-testid="lab"
      data-demo={props.demo}
      holdRadius={HOLD_RADIUS}
      className="fixed inset-0 flex h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <TopBar demo={props.demo} />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Screen key={props.demo} />
      </main>
      <TabBar demo={props.demo} onDemo={props.onDemo} inset={HOLD_RADIUS} />
    </GestureZone>
  );
}
