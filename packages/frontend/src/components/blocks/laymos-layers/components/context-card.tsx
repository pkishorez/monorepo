import type { ReportGraph } from 'laymos/report';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { cn } from '#lib/utils';

import { layerColors } from '../lib/colors';
import type {
  ActiveModel,
  LayerSummary,
  LaymosLayersModel,
} from '../lib/model';

function percent(covered: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((covered / total) * 100)}%`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Metrics({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-3 gap-3">{children}</dl>;
}

function Overview({ model }: { model: LaymosLayersModel }) {
  const coverage = model.report.coverage.layers;
  return (
    <>
      <div>
        <p className="text-xs font-semibold">Architecture overview</p>
        <p className="text-[11px] text-muted-foreground">
          Hover a graph or layer to preview. Click to keep it active.
        </p>
      </div>
      <Metrics>
        <Metric label="Graphs" value={model.graphByName.size} />
        <Metric label="Layers" value={model.layers.size} />
        <Metric
          label="Coverage"
          value={percent(coverage.coveredFiles, coverage.totalFiles)}
        />
      </Metrics>
    </>
  );
}

function Legend({
  color,
  label,
  dashed = false,
  width = 2,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  width?: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn('block w-5', dashed && 'border-t-2 border-dashed')}
        style={
          dashed
            ? { borderColor: color }
            : { height: width, backgroundColor: color }
        }
      />
      {label}
    </span>
  );
}

function EdgeLegend({ model }: { model: LaymosLayersModel }) {
  const layerViolations = model.report.violations.filter(
    (violation) => violation.kind === 'layer',
  ).length;
  return (
    <div className="space-y-1.5 border-t border-border/60 pt-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Edge colors
      </p>
      <div className="grid gap-1 text-[10px] text-muted-foreground">
        <Legend color={layerColors.configured} label="Configured permission" />
        <Legend
          color={layerColors.observedOutgoing}
          label="Observed import; outgoing from active layer"
          width={3}
        />
        <Legend
          color={layerColors.observedIncoming}
          label="Incoming to active layer"
          width={3}
        />
        <Legend
          color={layerColors.violation}
          label={`Violating import (${layerViolations})`}
          dashed
        />
      </div>
    </div>
  );
}

function GraphDetails({
  graph,
  model,
  active,
}: {
  graph: ReportGraph;
  model: LaymosLayersModel;
  active: ActiveModel;
}) {
  const configured = model.displayConfiguredEdges.filter(
    (edge) => edge.graph === graph.name,
  ).length;
  const observed = model.observedEdges.filter((edge) =>
    active.visibleObservedEdges.has(`${edge.from}\0${edge.to}`),
  ).length;
  const violations = model.report.violations.filter(
    (violation) =>
      violation.kind === 'layer' &&
      (graph.layers.includes(violation.from.layer) ||
        graph.layers.includes(violation.to.layer)),
  ).length;
  return (
    <>
      <div>
        <p className="text-xs font-semibold">{graph.name}</p>
        {graph.description && (
          <p className="text-[11px] text-muted-foreground">
            {graph.description}
          </p>
        )}
      </div>
      <Metrics>
        <Metric label="Layers" value={graph.layers.length} />
        <Metric label="Configured" value={configured} />
        <Metric label="Observed" value={observed} />
      </Metrics>
      {violations > 0 && (
        <p className="text-[11px] font-medium text-destructive">
          {violations} incident layer{' '}
          {violations === 1 ? 'violation' : 'violations'}
        </p>
      )}
    </>
  );
}

function LayerDetails({
  layer,
  model,
}: {
  layer: LayerSummary;
  model: LaymosLayersModel;
}) {
  const incoming = model.observedEdges.filter(
    (edge) => edge.to === layer.name,
  ).length;
  const outgoing = model.observedEdges.filter(
    (edge) => edge.from === layer.name,
  ).length;
  const violations =
    layer.incomingViolationCount + layer.outgoingViolationCount;
  return (
    <>
      <div>
        <p className="text-xs font-semibold">{layer.name}</p>
        {layer.description && (
          <p className="text-[11px] text-muted-foreground">
            {layer.description}
          </p>
        )}
      </div>
      <Metrics>
        <Metric label="Files" value={layer.fileCount} />
        <Metric
          label="Modules"
          value={percent(layer.moduleCoveredFiles, layer.moduleTotalFiles)}
        />
        <Metric label="Violations" value={violations} />
      </Metrics>
      <div className="flex gap-4 text-[11px] text-muted-foreground">
        <span>{incoming} observed incoming</span>
        <span>{outgoing} observed outgoing</span>
      </div>
      {layer.paths.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Declared paths
          </p>
          <ul className="space-y-0.5 font-mono text-[10px]">
            {layer.paths.map((path) => (
              <li key={path} className="truncate">
                {path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function ContextCard({
  model,
  active,
  defaultMinimise,
}: {
  model: LaymosLayersModel;
  active: ActiveModel;
  defaultMinimise: boolean;
}) {
  const [minimised, setMinimised] = useState(defaultMinimise);
  const graph =
    active.node?.kind === 'graph'
      ? model.graphByName.get(active.node.name)
      : undefined;
  const layer =
    active.node?.kind === 'layer'
      ? model.layers.get(active.node.name)
      : undefined;
  if (minimised) {
    return (
      <button
        type="button"
        className="nodrag nopan nowheel flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2.5 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        onClick={() => setMinimised(false)}
        aria-label="Show architecture summary"
      >
        <ChevronDown className="size-3.5" />
        Summary
      </button>
    );
  }

  return (
    <aside className="nodrag nopan nowheel pointer-events-auto relative w-72 space-y-3 rounded-lg border border-border bg-background/95 p-3 pr-9 text-foreground shadow-md backdrop-blur">
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        onClick={() => setMinimised(true)}
        aria-label="Hide architecture summary"
      />
      <ChevronUp className="pointer-events-none absolute right-3 top-3 size-3.5 text-muted-foreground" />
      <div className="pointer-events-none contents">
        {graph ? (
          <GraphDetails graph={graph} model={model} active={active} />
        ) : layer ? (
          <LayerDetails layer={layer} model={model} />
        ) : (
          <Overview model={model} />
        )}
        <EdgeLegend model={model} />
      </div>
    </aside>
  );
}
