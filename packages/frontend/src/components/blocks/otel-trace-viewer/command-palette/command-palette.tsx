import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#components/ui/command';

import { StatusDot } from '../status';
import type { SpanNode, TraceGroup } from '../utils';
import { formatDuration } from '../utils';

interface CommandPaletteProps {
  traces: TraceGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (trace: TraceGroup) => void;
}

function collectSpanNames(nodes: SpanNode[]): string[] {
  const names: string[] = [];
  function visit(node: SpanNode) {
    names.push(node.span.name);
    node.children.forEach(visit);
  }
  nodes.forEach(visit);
  return names;
}

export function CommandPalette({
  traces,
  open,
  onOpenChange,
  onSelect,
}: CommandPaletteProps) {
  function handleSelect(trace: TraceGroup) {
    onSelect(trace);
    onOpenChange(false);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search Traces"
      description="Search by trace name or span name"
    >
      <CommandInput placeholder="Search traces and spans..." />
      <CommandList className="max-h-96">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Traces">
          {traces.map((trace) => (
            <CommandItem
              key={trace.traceId}
              value={`trace:${trace.name}:${trace.traceId}`}
              onSelect={() => handleSelect(trace)}
            >
              <StatusDot status={trace.status} />
              <span className="flex-1 truncate font-mono text-sm">
                {trace.name}
              </span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                {trace.spanCount} spans · {formatDuration(trace.duration)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Spans">
          {traces.flatMap((trace) =>
            collectSpanNames(trace.roots).map((spanName, i) => (
              <CommandItem
                key={`${trace.traceId}:${spanName}:${i}`}
                value={`span:${spanName}:${trace.traceId}`}
                onSelect={() => handleSelect(trace)}
              >
                <span className="flex-1 truncate font-mono text-sm">
                  {spanName}
                </span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  in {trace.name}
                </span>
              </CommandItem>
            )),
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
