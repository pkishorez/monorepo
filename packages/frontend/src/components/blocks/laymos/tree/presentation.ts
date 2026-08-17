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

// Selection reads as a calm filled row, not a saturated one: the surrounding
// tree is monochrome, so contrast alone is enough to find it.
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

// Layer and Module are permanent structure: weight and icon separate them, not hue.
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
