import type { RecordedFlow } from '@pkishorez/effect-tracer/flow';
import { scrollbarStyles } from '#lib/scrollStyles';
import { FlowCanvas } from './flow-canvas';
import { makeFlowLayout } from './layout';

type RecordedFlowActivity = Extract<
  RecordedFlow['items'][number],
  { kind: 'activity' }
>;

interface FlowSwimlaneProps {
  readonly flow: RecordedFlow;
  readonly className?: string;
  readonly onActivityClick?: (activity: RecordedFlowActivity) => void;
}

/** Renders a canonical lotel Flow as an equal-step swim lane. */
export function FlowSwimlane({
  flow,
  className,
  onActivityClick,
}: FlowSwimlaneProps) {
  const layout = makeFlowLayout(flow.items);

  return (
    <div
      className={`overflow-auto ${scrollbarStyles} ${className ?? ''}`}
      data-flow-id={flow.id}
    >
      <FlowCanvas
        flowId={flow.id}
        layout={layout}
        onActivityClick={onActivityClick}
      />
    </div>
  );
}
