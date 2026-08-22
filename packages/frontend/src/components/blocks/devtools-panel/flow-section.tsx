import { useEffect, useState } from 'react';
import { RecordedFlowSchema } from '@pkishorez/effect-tracer/flow';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import { FlowSwimlane } from '../flow-swimlane/flow-swimlane';

type RecordedFlow = typeof RecordedFlowSchema.Type;

interface FlowSectionProps {
  readonly flows: readonly RecordedFlow[];
  readonly className?: string;
}

function flowLabel(flow: RecordedFlow): string {
  const participant = flow.activations[0]?.participantName;
  return participant ? `${participant} · ${flow.id}` : flow.id;
}

/** Lets the developer pick a recorded Flow, then shows it. */
export function FlowSection({ flows, className }: FlowSectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    flows.find((flow) => flow.id === selectedId) ?? flows[0] ?? null;

  useEffect(() => {
    if (!flows.some((flow) => flow.id === selectedId)) {
      setSelectedId(flows[0]?.id ?? null);
    }
  }, [flows, selectedId]);

  if (flows.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-sm text-muted-foreground',
          className,
        )}
      >
        No flows recorded yet.
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-1.5">
        {flows.map((flow) => (
          <Button
            key={flow.id}
            variant={flow.id === selected?.id ? 'secondary' : 'ghost'}
            size="sm"
            className="shrink-0"
            onClick={() => setSelectedId(flow.id)}
          >
            {flowLabel(flow)}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {selected && <FlowSwimlane flow={selected} className="h-full" />}
      </div>
    </div>
  );
}
