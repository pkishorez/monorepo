import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import { cn } from '#lib/utils';

import type { ActiveModulesModel } from '../lib/connectivity';
import { moduleColors } from '../lib/colors';
import {
  moduleEdgeKey,
  type LaymosModulesModel,
  type ModuleSummary,
} from '../lib/model';
import type { LaymosModulesProps } from '../types';

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

function percent(covered: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((covered / total) * 100)}%`;
}

function Overview({ model }: { model: LaymosModulesModel }) {
  const total = model.report.coverage.modules.reduce(
    (sum, coverage) => sum + coverage.totalFiles,
    0,
  );
  const covered = model.report.coverage.modules.reduce(
    (sum, coverage) => sum + coverage.coveredFiles,
    0,
  );
  const violations = model.report.violations.filter(
    (violation) => violation.kind === 'module',
  ).length;
  return (
    <>
      <div>
        <p className="text-xs font-semibold">Module architecture</p>
        <p className="text-[11px] text-muted-foreground">
          Hover for direct connections. Left click to keep them active; right
          click for transitive reachability.
        </p>
      </div>
      <Metrics>
        <Metric label="Modules" value={model.modules.size} />
        <Metric label="Layers" value={model.layers.size} />
        <Metric label="Coverage" value={percent(covered, total)} />
      </Metrics>
      {violations > 0 && (
        <p className="text-[11px] font-medium text-destructive">
          {violations} module {violations === 1 ? 'violation' : 'violations'}
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Connectivity includes declared modules only. Layer headers report files
        that are not assigned to a module.
      </p>
    </>
  );
}

function DepthControl({
  path,
  depth,
  onChange,
}: {
  path: string;
  depth: 'direct' | 'transitive';
  onChange: LaymosModulesProps['onSelectedModuleChange'];
}) {
  return (
    <div
      className="grid grid-cols-2 rounded-md border border-border bg-muted/40 p-0.5"
      aria-label="Connection depth"
    >
      {(['direct', 'transitive'] as const).map((next) => (
        <button
          key={next}
          type="button"
          className={cn(
            'rounded px-2 py-1 text-[10px] font-medium capitalize text-muted-foreground transition-colors',
            depth === next && 'bg-background text-foreground shadow-sm',
          )}
          aria-pressed={depth === next}
          onClick={() => onChange({ path, depth: next })}
        >
          {next}
        </button>
      ))}
    </div>
  );
}

function PermissionList({
  title,
  paths,
  module,
  model,
}: {
  title: string;
  paths: readonly string[] | undefined;
  module: string;
  model: LaymosModulesModel;
}) {
  if (paths === undefined) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {paths.length === 0 ? (
        <p className="text-[10px] font-mono text-muted-foreground">None</p>
      ) : (
        <ul className="space-y-0.5 text-[10px] font-mono">
          {paths.map((path) => {
            const observed =
              title === 'Can import'
                ? model.observedEdgeByKey.has(moduleEdgeKey(module, path))
                : model.observedEdgeByKey.has(moduleEdgeKey(path, module));
            return (
              <li key={path} className="flex justify-between gap-2">
                <span className="truncate">{path}</span>
                {!observed && (
                  <span className="shrink-0 text-muted-foreground">unused</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ModuleDetails({
  module,
  model,
  active,
  onSelectedModuleChange,
}: {
  module: ModuleSummary;
  model: LaymosModulesModel;
  active: ActiveModulesModel;
  onSelectedModuleChange: LaymosModulesProps['onSelectedModuleChange'];
}) {
  const incoming = model.observedEdges.filter(
    (edge) => edge.to === module.path,
  ).length;
  const outgoing = model.observedEdges.filter(
    (edge) => edge.from === module.path,
  ).length;
  const boundaryIncoming = module.boundaryEdges.filter(
    (edge) => edge.direction === 'incoming',
  );
  const boundaryOutgoing = module.boundaryEdges.filter(
    (edge) => edge.direction === 'outgoing',
  );
  return (
    <>
      <div>
        <p className="truncate text-xs font-semibold">{module.label}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">
          {module.path}
        </p>
        {module.description && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {module.description}
          </p>
        )}
      </div>
      <DepthControl
        path={module.path}
        depth={active.depth}
        onChange={onSelectedModuleChange}
      />
      <Metrics>
        <Metric label="Files" value={module.files.length} />
        <Metric label="Incoming" value={incoming} />
        <Metric label="Outgoing" value={outgoing} />
      </Metrics>
      <div className="text-[11px] text-muted-foreground">
        <p>Layer: {module.layer}</p>
        {(boundaryIncoming.length > 0 || boundaryOutgoing.length > 0) && (
          <p style={{ color: moduleColors.coverageGap }}>
            {boundaryIncoming.length} incoming and {boundaryOutgoing.length}{' '}
            outgoing imports cross the module coverage boundary
          </p>
        )}
      </div>
      {module.rules && (
        <div className="space-y-2 border-t border-border/60 pt-2.5">
          <PermissionList
            title="Can import"
            paths={module.rules.canImport}
            module={module.path}
            model={model}
          />
          <PermissionList
            title="Can be imported by"
            paths={module.rules.canImportedBy}
            module={module.path}
            model={model}
          />
        </div>
      )}
    </>
  );
}

function ComparisonDetails({
  model,
  active,
}: {
  model: LaymosModulesModel;
  active: ActiveModulesModel;
}) {
  const root = model.modules.get(active.root!);
  const target = active.comparison
    ? model.modules.get(active.comparison.target)
    : undefined;
  if (!root || !target || !active.comparison) return null;
  const comparison = active.comparison;
  const transitiveDistance = Math.min(
    active.incomingDistances.get(target.path) ?? Number.POSITIVE_INFINITY,
    active.outgoingDistances.get(target.path) ?? Number.POSITIVE_INFINITY,
  );
  const evidence = [...comparison.edgeKeys].flatMap(
    (key) => model.observedEdgeByKey.get(key)?.fileEdges ?? [],
  );
  const layers = new Set<string>([root.layer, target.layer]);
  for (const key of comparison.edgeKeys) {
    const separator = key.indexOf('\0');
    const from = model.modules.get(key.slice(0, separator));
    const to = model.modules.get(key.slice(separator + 1));
    if (from) layers.add(from.layer);
    if (to) layers.add(to.layer);
  }
  const related = comparison.directions.length > 0;
  const transitivelyRelated = !related && Number.isFinite(transitiveDistance);
  return (
    <>
      <div>
        <p className="text-xs font-semibold">
          {root.label} ↔ {target.label}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {related
            ? comparison.directions.length === 2
              ? 'Connected in both directions'
              : comparison.directions[0] === 'outgoing'
                ? `${root.label} depends on ${target.label}`
                : `${target.label} depends on ${root.label}`
            : transitivelyRelated && active.depth === 'direct'
              ? 'Transitively related — switch to transitive'
              : 'No observed connection in this scope'}
        </p>
      </div>
      {related && (
        <>
          <Metrics>
            <Metric label="Hops" value={comparison.distance ?? 0} />
            <Metric label="Routes" value={comparison.routeCount} />
            <Metric label="Layers" value={layers.size} />
          </Metrics>
          <div className="max-h-44 space-y-1 overflow-auto border-t border-border/60 pt-2.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Import evidence
            </p>
            {evidence.map((edge) => (
              <div
                key={`${edge.from}\0${edge.to}`}
                className={cn(
                  'rounded border border-border/60 p-1.5 font-mono text-[9px]',
                  edge.violating && 'border-destructive/50 text-destructive',
                )}
              >
                <p className="truncate">{edge.from}</p>
                <p className="truncate text-muted-foreground">→ {edge.to}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Legend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn('block w-5', dashed && 'border-t-2 border-dashed')}
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

function EdgeLegend() {
  return (
    <div className="space-y-1.5 border-t border-border/60 pt-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Connections
      </p>
      <div className="grid gap-1 text-[10px] text-muted-foreground">
        <Legend color={moduleColors.outgoing} label="Outgoing dependency" />
        <Legend color={moduleColors.incoming} label="Incoming consumer" />
        <Legend
          color={moduleColors.violation}
          label="Violating import"
          dashed
        />
        <Legend
          color={moduleColors.configured}
          label="Layer hierarchy"
          dashed
        />
      </div>
    </div>
  );
}

export function ContextCard({
  model,
  active,
  selectedModule,
  onSelectedModuleChange,
  defaultMinimise,
}: {
  model: LaymosModulesModel;
  active: ActiveModulesModel;
  selectedModule: LaymosModulesProps['selectedModule'];
  onSelectedModuleChange: LaymosModulesProps['onSelectedModuleChange'];
  defaultMinimise: boolean;
}) {
  const [minimised, setMinimised] = useState(defaultMinimise);
  const root = active.root ? model.modules.get(active.root) : undefined;
  if (minimised) {
    return (
      <button
        type="button"
        className="nodrag nopan nowheel flex items-center gap-1.5 rounded-md border border-border bg-background/95 px-2.5 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        onClick={() => setMinimised(false)}
        aria-label="Show module summary"
      >
        <ChevronDown className="size-3.5" />
        Summary
      </button>
    );
  }
  return (
    <aside className="nodrag nopan nowheel pointer-events-auto relative w-80 space-y-3 rounded-lg border border-border bg-background/95 p-3 pr-9 text-foreground shadow-md backdrop-blur">
      <button
        type="button"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => setMinimised(true)}
        aria-label="Hide module summary"
      >
        <ChevronUp className="size-3.5" />
      </button>
      {active.comparison ? (
        <ComparisonDetails model={model} active={active} />
      ) : root ? (
        <ModuleDetails
          module={root}
          model={model}
          active={active}
          onSelectedModuleChange={onSelectedModuleChange}
        />
      ) : (
        <Overview model={model} />
      )}
      {root && !selectedModule && (
        <p className="text-[10px] text-muted-foreground">
          Click to keep this direct neighborhood active.
        </p>
      )}
      <EdgeLegend />
    </aside>
  );
}
