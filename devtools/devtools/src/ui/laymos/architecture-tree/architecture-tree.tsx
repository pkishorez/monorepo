import type { CSSProperties } from 'react';

import { FolderIcon } from '@monorepo/frontend/lib/lucide';
import { cn } from '@monorepo/frontend/lib/utils';

export type ArchitectureTreeBoundaryState =
  | 'neutral'
  | 'selected'
  | 'related'
  | 'violation'
  | 'dimmed';

export type ArchitectureTreeBoundaryKind = 'layer' | 'module';

export const architectureTreeList = 'space-y-px';

export const architectureTreeBranch =
  'flex h-7 min-w-0 items-center gap-1.5 pe-1 font-mono text-xs text-muted-foreground/60';

export const architectureTreeBoundary =
  'flex h-8 w-full min-w-0 items-center gap-1.5 rounded bg-transparent pe-1.5 font-mono text-xs font-medium text-foreground outline-none';

const architectureTreeBoundaryIconBase =
  'grid size-5 shrink-0 place-items-center text-muted-foreground';

export const architectureTreeGuide = 'absolute inset-y-0 w-px bg-border/70';

export function architectureTreeSelectedStyle(): CSSProperties {
  return {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  };
}

export function architectureTreeIndent(depth: number): string {
  return `${depth * 0.8 + 0.25}rem`;
}

export function architectureTreeGuideIndent(depth: number): string {
  return `${depth * 0.8 + 0.68}rem`;
}

export function layerIdsByBoundaryPath(
  layers: readonly {
    readonly id: string;
    readonly scopes: readonly { readonly path: string }[];
  }[],
): ReadonlyMap<string, string> {
  return new Map(
    layers.flatMap(({ id, scopes }) =>
      scopes.map(({ path }) => [path, id] as const),
    ),
  );
}

export function architectureTreeBoundaryState(
  state: ArchitectureTreeBoundaryState,
): string {
  return cn(
    state === 'selected' && 'font-bold shadow-sm',
    state === 'violation' && 'text-destructive',
    state === 'dimmed' && 'opacity-50',
  );
}

export function architectureTreeBoundaryKind(
  kind: ArchitectureTreeBoundaryKind,
): string {
  return kind === 'layer'
    ? 'text-foreground font-semibold'
    : 'text-foreground/90';
}

export function architectureTreeBoundaryIcon(
  kind: ArchitectureTreeBoundaryKind,
  state: ArchitectureTreeBoundaryState,
): string {
  return cn(
    architectureTreeBoundaryIconBase,
    kind === 'layer' ? 'text-foreground' : 'text-muted-foreground',
    state === 'violation' && 'text-destructive',
  );
}

interface ArchitectureTreeLegendProps {
  readonly title: string;
  readonly boundaryLabel: 'Layer' | 'Module';
}

export function ArchitectureTreeLegend({
  title,
  boundaryLabel,
}: ArchitectureTreeLegendProps) {
  const isLayer = boundaryLabel === 'Layer';
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="flex items-center gap-2.5 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <FolderIcon className="size-3 text-muted-foreground/60" />
          Folder
        </span>
        {!isLayer && (
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <FolderIcon className="size-3 text-foreground" />
            Layer
          </span>
        )}
        <span
          className={
            isLayer
              ? 'flex items-center gap-1 font-semibold text-foreground'
              : 'flex items-center gap-1 text-foreground/90'
          }
        >
          <FolderIcon
            className={
              isLayer
                ? 'size-3 text-foreground'
                : 'size-3 text-muted-foreground'
            }
          />
          {boundaryLabel}
        </span>
      </div>
    </div>
  );
}
