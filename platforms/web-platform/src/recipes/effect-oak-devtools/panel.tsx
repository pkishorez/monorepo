import { memo, useState } from 'react';
import type { ReactNode } from 'react';
import { Pause, Play, Trash2 } from '#lib/lucide';
import { Button } from '#components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import type { Inspection, Tab } from './inspection/index.ts';
import { Inspector } from './inspector/index.ts';
import { LiveDot } from './live-dot.tsx';
import { Segmented } from './segmented/index.ts';
import { Timeline } from './timeline/index.ts';

/**
 * The panel: Timeline and Inspector tabs, whether the app is live, and Stop,
 * Start and Clear, which asks first.
 */
export const Panel = ({
  inspection,
  fold,
}: {
  readonly inspection: Inspection;
  /** The button that folds the panel, where it folds. */
  readonly fold: ReactNode;
}) => {
  const { tab, runtime } = inspection;
  const [clearing, setClearing] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b px-2">
        <Segmented
          id="oak-inspection-tab"
          label="View"
          value={tab}
          options={TABS}
          onChange={inspection.setTab}
        />
        <span className="flex-1" />
        {inspection.live ? (
          <span className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <LiveDot inspection={inspection} />
            {runtime.running ? 'Live' : 'Stopped'}
          </span>
        ) : (
          <Button size="sm" variant="secondary" onClick={inspection.goLive}>
            Back to live
          </Button>
        )}
        {runtime.running ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Stop the app"
            title="Stop"
            onClick={runtime.stop}
          >
            <Pause />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Start the app"
            title="Start"
            onClick={() => runtime.start()}
          >
            <Play />
          </Button>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Clear the Log"
          title="Clear"
          onClick={() => setClearing(true)}
        >
          <Trash2 />
        </Button>
        {fold}
      </header>
      <div className="min-h-0 flex-1">
        <Body inspection={inspection} />
      </div>
      <AlertDialog open={clearing} onOpenChange={setClearing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the Log?</AlertDialogTitle>
            <AlertDialogDescription>
              Every Message on every Branch goes, and the app starts again from
              init.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                runtime.clear();
                setClearing(false);
              }}
            >
              Clear the Log
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** The Timeline or the Inspector: drawn again only when the Inspection changes. */
const Body = memo(({ inspection }: { readonly inspection: Inspection }) =>
  inspection.tab === 'timeline' ? (
    <Timeline inspection={inspection} />
  ) : (
    <Inspector inspection={inspection} />
  ),
);

const TABS: ReadonlyArray<{ readonly value: Tab; readonly label: string }> = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'inspector', label: 'Inspector' },
];
