import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { cn } from '#lib/utils';

import { moduleGraphColors } from '../lib/colors';
import type { ModuleGraphModel } from '../lib/model';
import type { ModuleGraphSelectionModel } from '../lib/selection';
import type { LaymosModuleSelection } from '../types';

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Legend({
  label,
  color,
  dashed = false,
}: {
  label: string;
  color: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn('w-5', dashed && 'border-t-2 border-dashed')}
        style={
          dashed
            ? { borderColor: color }
            : { height: 2, backgroundColor: color }
        }
      />
      {label}
    </span>
  );
}

export function ModuleContextCard({
  model,
  selection,
  selectionModel,
  previewModule,
  defaultMinimise,
}: {
  readonly model: ModuleGraphModel;
  readonly selection: LaymosModuleSelection | null;
  readonly selectionModel: ModuleGraphSelectionModel;
  readonly previewModule: string | null;
  readonly defaultMinimise: boolean;
}) {
  const [minimised, setMinimised] = useState(defaultMinimise);
  const activePath = previewModule ?? selection?.path ?? null;
  const activeModule = activePath ? model.modules.get(activePath) : undefined;

  if (minimised) {
    return (
      <button
        type="button"
        className="nodrag nopan nowheel flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2.5 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
        onClick={() => setMinimised(false)}
      >
        <ChevronDown className="size-3.5" />
        Module context
      </button>
    );
  }

  return (
    <aside className="nodrag nopan nowheel pointer-events-auto w-80 overflow-hidden rounded-lg border border-border bg-background/95 text-foreground shadow-md backdrop-blur">
      <header className="flex items-start justify-between gap-3 border-b border-border/70 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">
            {activeModule?.label ?? 'Module overview'}
          </p>
          <p className="truncate font-mono text-[9px] text-muted-foreground">
            {activeModule?.path ??
              `${model.modules.size} modules across ${model.layers.size} layers`}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setMinimised(true)}
          aria-label="Hide module context"
        >
          <ChevronUp className="size-3.5" />
        </button>
      </header>

      <div className="p-3">
        {activeModule ? (
          <div className="space-y-3">
            {activeModule.description && (
              <p className="text-[11px] text-muted-foreground">
                {activeModule.description}
              </p>
            )}
            <dl className="grid grid-cols-3 gap-3">
              <Metric label="Files" value={activeModule.files.length} />
              <Metric label="Incoming" value={selectionModel.incomingCount} />
              <Metric label="Outgoing" value={selectionModel.outgoingCount} />
            </dl>
            {selection?.depth === 'transitive' && (
              <p className="text-[10px] text-muted-foreground">
                Complete traversal · maximum depth {selectionModel.maximumDepth}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Select a module for direct dependencies. Right-click for its
              complete transitive neighborhood.
            </p>
            <dl className="grid grid-cols-3 gap-3">
              <Metric label="Graphs" value={model.graphs.length} />
              <Metric label="Layers" value={model.layers.size} />
              <Metric label="Modules" value={model.modules.size} />
            </dl>
          </div>
        )}

        <div className="mt-3 grid gap-1 border-t border-border/60 pt-2.5 text-[9px] text-muted-foreground">
          <Legend label="Imports" color={moduleGraphColors.outgoing} />
          <Legend label="Consumed by" color={moduleGraphColors.incoming} />
          <Legend
            label="Violating import"
            color={moduleGraphColors.violation}
            dashed
          />
        </div>
      </div>
    </aside>
  );
}
