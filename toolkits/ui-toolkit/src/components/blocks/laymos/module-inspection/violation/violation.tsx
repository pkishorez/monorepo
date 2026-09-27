import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileQuestion,
  Link2Off,
  PackageX,
  RefreshCw,
} from '#lib/lucide';
import { cn } from '#lib/utils';

import type { ModuleViolation } from '../../analysis-presentation';

interface ModuleViolationsListProps {
  readonly violations: readonly ModuleViolation[];
  readonly activeViolationId?: string;
  readonly onActiveViolationChange?: (violationId: string | undefined) => void;
  readonly className?: string;
}

export function ModuleViolationsList({
  violations,
  activeViolationId,
  onActiveViolationChange,
  className,
}: ModuleViolationsListProps) {
  if (violations.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 text-sm text-muted-foreground',
          className,
        )}
      >
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        No Module violations
      </div>
    );
  }

  return (
    <div
      className={cn(
        'divide-y divide-border overflow-hidden rounded-md border border-border',
        className,
      )}
    >
      {violations.map((violation) => (
        <ViolationRow
          key={violation.id}
          violation={violation}
          active={activeViolationId === violation.id}
          onActivate={() =>
            onActiveViolationChange?.(
              activeViolationId === violation.id ? undefined : violation.id,
            )
          }
        />
      ))}
    </div>
  );
}

function ViolationRow({
  violation,
  active,
  onActivate,
}: {
  readonly violation: ModuleViolation;
  readonly active: boolean;
  readonly onActivate: () => void;
}) {
  const Icon = violationIcon(violation);
  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40',
        active && 'bg-destructive/5',
      )}
      aria-pressed={active}
      onClick={onActivate}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 text-[11px] leading-4">
        <span className="block font-medium text-foreground">
          {violationTitle(violation)}
        </span>
        <span className="mt-0.5 flex min-w-0 items-start gap-1 font-mono text-muted-foreground">
          {violationDescription(violation)}
        </span>
      </span>
    </button>
  );
}

function violationIcon(violation: ModuleViolation) {
  switch (violation.kind) {
    case 'dependency':
      return Link2Off;
    case 'boundary':
      return PackageX;
    case 'cycle':
      return RefreshCw;
    case 'missing-entry-point':
      return CircleAlert;
    case 'unused-shared':
    case 'dead-module':
      return CircleAlert;
    case 'coverage':
    case 'graph-coverage':
      return FileQuestion;
  }
}

function violationTitle(violation: ModuleViolation): string {
  switch (violation.kind) {
    case 'dependency':
      return 'Forbidden Module dependency';
    case 'boundary':
      return 'Internal Module import';
    case 'cycle':
      return 'Module cycle';
    case 'missing-entry-point':
      return 'Missing Module entry point';
    case 'unused-shared':
      return 'Unused Shared Module';
    case 'dead-module':
      return 'Module nothing may import';
    case 'coverage':
      return 'Unassigned file';
    case 'graph-coverage':
      return 'File below a Module Graph with no member';
  }
}

function violationDescription(violation: ModuleViolation) {
  switch (violation.kind) {
    case 'dependency':
    case 'boundary':
      return (
        <>
          <span className="truncate">{shortName(violation.fromModuleId)}</span>
          <ArrowRight className="mt-0.5 size-2.5 shrink-0" />
          <span className="truncate">{shortName(violation.toModuleId)}</span>
        </>
      );
    case 'cycle':
      return (
        <span className="truncate">
          {violation.moduleIds.map(shortName).join(' → ')}
        </span>
      );
    case 'missing-entry-point':
      return <span className="truncate">{violation.path}</span>;
    case 'unused-shared':
    case 'dead-module':
      return <span className="truncate">{violation.moduleId}</span>;
    case 'coverage':
      return <span className="truncate">{violation.file}</span>;
    case 'graph-coverage':
      return (
        <>
          <span className="truncate">{violation.graphId}</span>
          <ArrowRight className="mt-0.5 size-2.5 shrink-0" />
          <span className="truncate">{violation.file}</span>
        </>
      );
  }
}

function shortName(path: string): string {
  return path.split('/').at(-1) ?? path;
}
