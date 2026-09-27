import {
  GestureFingers,
  GestureProvider,
} from 'kui-toolkit/components/blocks/gestures';
import { useState } from 'react';
import { LabSidebar } from '../sidebar/index.ts';
import { TutorialDialog } from '../tutorial/index.ts';
import { TabBar, TopBar } from './bars.tsx';
import { DEMOS, type DemoId } from './demos.ts';
import { Menu } from './menu.tsx';

export { parseDemo } from './demos.ts';
export type { DemoId } from './demos.ts';

/**
 * The Gesture Lab, full screen: one GestureProvider around everything, each
 * demo in a zone of its own inside it, the lab's sidebar on the root zone,
 * and a tutorial per demo. `demo` is the one showing; `onDemo` switches.
 */
export function GestureLab(props: {
  readonly demo: DemoId;
  readonly onDemo: (demo: DemoId) => void;
}) {
  const [help, setHelp] = useState(false);
  const { Screen, tutorial } = DEMOS[props.demo];
  return (
    <GestureProvider
      scroll="none"
      data-testid="lab"
      data-demo={props.demo}
      className="fixed inset-0 h-dvh overflow-hidden bg-background text-foreground"
    >
      <LabSidebar panel={<Menu demo={props.demo} onDemo={props.onDemo} />}>
        <TopBar demo={props.demo} onHelp={() => setHelp(true)} />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <Screen key={props.demo} />
        </main>
        <TabBar demo={props.demo} onDemo={props.onDemo} />
      </LabSidebar>
      <GestureFingers />
      <TutorialDialog tutorial={tutorial} open={help} onOpenChange={setHelp} />
    </GestureProvider>
  );
}
