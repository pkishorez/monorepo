import { GestureZone } from '@kstackz/ui-toolkit/components/blocks/gestures';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  motion,
  type MotionValue,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { useLabSidebar } from '../sidebar/index.ts';
import { PANEL_WIDTH, usePanelGestures } from './gestures.ts';

export { sidebarTutorial } from './tutorial.tsx';

/** One Swipe's live state: its progress as a number and a bar. */
function Readout(props: {
  readonly name: string;
  readonly testId: string;
  readonly progress: MotionValue<number>;
  readonly source: 'edge' | 'zone';
  readonly available: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}) {
  const value = useTransform(props.progress, (progress) => progress.toFixed(2));
  const width = useTransform(
    props.progress,
    (progress) => `${Math.min(1, Math.max(0, progress)) * 100}%`,
  );
  return (
    <section
      data-testid={props.testId}
      data-source={props.source}
      data-available={props.available ? '' : undefined}
      className="flex flex-col gap-2 rounded-xl bg-muted p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{props.name}</h2>
        <span className="font-mono text-xs text-muted-foreground">
          source: {props.available ? props.source : 'off'}
        </span>
      </div>
      <motion.p
        data-testid={`${props.testId}-progress`}
        className="font-mono text-3xl font-semibold tabular-nums"
      >
        {value}
      </motion.p>
      <div className="h-1.5 overflow-hidden rounded-full bg-background">
        <motion.div
          style={{ width }}
          className="h-full rounded-full bg-chart-8"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={props.onOpen}>
          Open
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onClose}>
          Close
        </Button>
      </div>
    </section>
  );
}

function Demo() {
  const sidebar = useLabSidebar();
  const panel = usePanelGestures();
  return (
    <>
      <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
        <p className="text-sm text-pretty text-muted-foreground">
          Start away from the browser&apos;s edge strips. Swipe right anywhere
          unclaimed for the sidebar, or left here for the panel.
        </p>
        <Readout
          name="Sidebar (the lab's)"
          testId="sidebar-readout"
          progress={sidebar.progress}
          source={sidebar.source}
          available={sidebar.available}
          onOpen={sidebar.open}
          onClose={sidebar.close}
        />
        <Readout
          name="Right panel"
          testId="panel-readout"
          progress={panel.progress}
          source={panel.source}
          available={panel.available}
          onOpen={panel.open}
          onClose={panel.close}
        />
      </div>
      <motion.button
        type="button"
        aria-label="Close the panel"
        data-testid="panel-scrim"
        tabIndex={-1}
        onClick={panel.close}
        style={{
          opacity: panel.scrimOpacity,
          pointerEvents: panel.scrimEvents,
        }}
        className="absolute inset-0 bg-black"
      />
      <motion.aside
        data-testid="panel"
        style={{ x: panel.x, width: PANEL_WIDTH }}
        className="absolute inset-y-0 right-0 flex flex-col gap-2 border-l border-border bg-popover p-4 text-popover-foreground shadow-lg"
      >
        <h2 className="font-medium">Right panel</h2>
        <p className="text-sm text-muted-foreground">
          Swipe right, or tap outside, to put it away.
        </p>
      </motion.aside>
    </>
  );
}

/** Sidebar: the lab's own sidebar on show, with a second panel from the right. */
export function SidebarScreen() {
  return (
    <GestureZone
      scroll="none"
      data-testid="sidebar-zone"
      className="relative h-full overflow-hidden"
    >
      <Demo />
    </GestureZone>
  );
}
