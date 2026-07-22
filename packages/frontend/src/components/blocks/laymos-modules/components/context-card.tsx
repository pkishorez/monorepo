import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import type { LaymosModulesModel, ModuleSummary } from '../lib/model';

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Overview({ model }: { model: LaymosModulesModel }) {
  const errors = model.report.violations.filter(
    (violation) => violation.kind === 'module',
  ).length;
  return (
    <>
      <div>
        <p className="text-xs font-semibold">Module overview</p>
        <p className="text-[11px] text-muted-foreground">
          Select a module to inspect its boundaries and warnings.
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        <Metric label="Modules" value={model.modules.size} />
        <Metric label="Errors" value={errors} />
        <Metric label="Warnings" value={model.cycles.length} />
      </dl>
    </>
  );
}

function RuleList({ module }: { module: ModuleSummary }) {
  if (!module.rules) return null;
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Rules
      </p>
      <div className="space-y-1 break-words font-mono text-[10px]">
        {module.rules.canImport && (
          <p>may import: {module.rules.canImport.join(', ') || 'none'}</p>
        )}
        {module.rules.canImportedBy && (
          <p>
            may be imported by:{' '}
            {module.rules.canImportedBy.join(', ') || 'none'}
          </p>
        )}
      </div>
    </div>
  );
}

function ModuleDetails({
  module,
  model,
}: {
  module: ModuleSummary;
  model: LaymosModulesModel;
}) {
  const incoming = model.predecessors.get(module.path)?.size ?? 0;
  const outgoing = model.successors.get(module.path)?.size ?? 0;
  const cyclePeers = module.cycle?.modulePaths.filter(
    (path) => path !== module.path,
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
      <dl className="grid grid-cols-3 gap-3">
        <Metric label="Files" value={module.files.length} />
        <Metric label="Errors" value={module.violationCount} />
        <Metric label="Warnings" value={module.warningCount} />
      </dl>
      <div className="flex gap-4 text-[11px] text-muted-foreground">
        <span>{incoming} incoming</span>
        <span>{outgoing} outgoing</span>
      </div>
      {cyclePeers && cyclePeers.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/35 bg-amber-500/10 p-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3" aria-hidden />
            Dependency cycle
          </p>
          <p className="text-[10px] text-muted-foreground">
            Cyclic with {cyclePeers.join(', ')}
          </p>
        </div>
      )}
      <RuleList module={module} />
    </>
  );
}

export function ContextCard({
  model,
  selectedModulePath,
  defaultMinimise,
}: {
  readonly model: LaymosModulesModel;
  readonly selectedModulePath: string | null;
  readonly defaultMinimise: boolean;
}) {
  const [minimised, setMinimised] = useState(defaultMinimise);
  const module = selectedModulePath
    ? model.modules.get(selectedModulePath)
    : undefined;
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
    <aside className="nodrag nopan nowheel pointer-events-auto relative w-72 space-y-3 rounded-lg border border-border bg-background/95 p-3 pr-9 text-foreground shadow-md backdrop-blur">
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
        onClick={() => setMinimised(true)}
        aria-label="Hide module summary"
      />
      <ChevronUp className="pointer-events-none absolute right-3 top-3 size-3.5 text-muted-foreground" />
      <div className="pointer-events-none contents">
        {module ? (
          <ModuleDetails module={module} model={model} />
        ) : (
          <Overview model={model} />
        )}
      </div>
    </aside>
  );
}
