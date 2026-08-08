import { cn } from '#lib/utils';
import type { CSSProperties } from 'react';

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

export function architectureTreeSelectedStyle(
  kind: ArchitectureTreeBoundaryKind,
): CSSProperties {
  return {
    backgroundColor:
      kind === 'layer' ? 'rgb(16 185 129 / 0.18)' : 'rgb(14 165 233 / 0.2)',
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
  if (kind === 'layer') {
    return 'text-emerald-600 dark:text-emerald-400';
  }
  return 'text-sky-700 dark:text-sky-300';
}

export function architectureTreeBoundaryIcon(
  kind: ArchitectureTreeBoundaryKind,
  state: ArchitectureTreeBoundaryState,
): string {
  return cn(
    architectureTreeBoundaryIconBase,
    kind === 'layer' && 'text-emerald-600 dark:text-emerald-400',
    kind === 'module' && 'text-sky-700 dark:text-sky-300',
    state === 'violation' && 'text-destructive',
  );
}
