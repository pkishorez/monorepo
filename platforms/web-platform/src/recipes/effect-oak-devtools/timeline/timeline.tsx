import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '#components/ui/resizable';
import { StepDetails } from '../details/index.ts';
import type { Inspection } from '../inspection/index.ts';
import { Rail } from './rail.tsx';

/**
 * The Log as a graph: one row per Message on every Branch, newest on top, each
 * a name and a dot. The first Branch runs down the middle, names to its left,
 * and every fork keeps a lane of its own to the right, so nothing ever moves.
 * The Branch in view is lit where it stands. Picking a row Time Travels
 * there, and a row on another Branch brings that Branch into view; the row
 * picked can open the Inspector or fork. Below, always, the Step picked, told
 * as it is below the Inspector.
 */
export const Timeline = ({
  inspection,
}: {
  readonly inspection: Inspection;
}) => (
  <ResizablePanelGroup orientation="vertical">
    <ResizablePanel defaultSize="60" minSize={140}>
      <Rail inspection={inspection} />
    </ResizablePanel>
    <ResizableHandle />
    <ResizablePanel defaultSize="40" minSize={120}>
      <StepDetails inspection={inspection} />
    </ResizablePanel>
  </ResizablePanelGroup>
);
