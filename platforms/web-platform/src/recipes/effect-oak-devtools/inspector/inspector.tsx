import { useState } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { StepDetails } from '../details/index.ts';
import type { Inspection } from '../inspection/index.ts';
import { Canvas } from './canvas/index.ts';
import { Drawing } from './drawing.tsx';
import { mapOf } from './map/index.ts';
import { StepBar } from './step-bar.tsx';

/**
 * The app as a map, lit up at the Step shown: every Actor, State and Child it
 * can have, dim until running, with what the Step started in green and
 * stopped in red. ↑ ↓ move one Step along the Branch in view, and every
 * change animates. A keyed Child opens to show its Instances. Below, the Step
 * told as it is below the Timeline, narrowed to the Instance picked.
 */
export const Inspector = ({
  inspection,
}: {
  readonly inspection: Inspection;
}) => {
  const { step, view, picked } = inspection;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const around = inspection.around(step);
  if (!around)
    return (
      <p className="p-4 text-sm text-muted-foreground">
        The app has not started yet.
      </p>
    );
  const map = mapOf(inspection.runtime.definition, around, step, open);
  const toggle = (id: string) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    setOpen(next);
  };

  return (
    <ResizablePanelGroup orientation="vertical">
      <ResizablePanel defaultSize="60" minSize={140}>
        <Canvas
          width={map.width}
          height={map.height}
          onBackground={() => inspection.pick(null)}
          overlay={
            <StepBar
              index={step === 'init' ? -1 : view.indexOf(step)}
              total={view.length}
              onMove={inspection.move}
            />
          }
        >
          <Drawing
            map={map}
            step={step}
            picked={picked}
            onPick={inspection.pick}
            onToggle={toggle}
          />
        </Canvas>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="40" minSize={120}>
        <StepDetails inspection={inspection} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
