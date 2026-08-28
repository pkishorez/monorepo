import type { ArchitectureAnalysis, ChangeSet, ChangeStatus } from 'laymos';

import { cn } from '@monorepo/frontend/lib/utils';

const changeLabels: Readonly<Record<ChangeStatus, string>> = {
  added: 'New',
  modified: 'Modified',
};

const changeShortLabels: Readonly<Record<ChangeStatus, string>> = {
  added: 'new',
  modified: 'mod',
};

export function changeSurfaceClass(status: ChangeStatus | undefined): string {
  switch (status) {
    case 'added':
      return 'border-green-500 ring-1 ring-green-500/40';
    case 'modified':
      return 'border-amber-500 ring-1 ring-amber-500/40';
    default:
      return '';
  }
}

export function ChangeBadge({
  status,
  label = changeShortLabels[status],
  className,
}: {
  readonly status: ChangeStatus;
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <span
      title={changeLabels[status]}
      className={cn(
        'shrink-0 rounded-sm border px-1 py-px text-[9px] font-semibold uppercase tracking-wider',
        status === 'added'
          ? 'border-green-500/60 text-green-600 dark:text-green-400'
          : 'border-amber-500/60 text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      {label}
    </span>
  );
}

export interface ChangeIndex {
  readonly baseRef: string;
  readonly files: ReadonlyMap<string, ChangeStatus>;
  readonly modules: ReadonlyMap<string, ChangeStatus>;
  readonly layers: ReadonlyMap<string, ChangeStatus>;
}

export function indexChanges(
  analysis: ArchitectureAnalysis,
  changes: ChangeSet,
): ChangeIndex {
  const files = new Map(
    changes.files.map(({ path, status }) => [path, status]),
  );
  return {
    baseRef: changes.baseRef,
    files,
    modules: rollUp(analysis.moduleAnalysis.membership, files),
    layers: rollUp(analysis.layerAnalysis.membership, files),
  };
}

export function changedPathsUnder(
  index: ChangeIndex,
  prefixes: string | readonly string[],
): ReadonlyMap<string, ChangeStatus> {
  const list = typeof prefixes === 'string' ? [prefixes] : prefixes;
  const owned = new Map<string, ChangeStatus>();
  for (const [path, status] of index.files) {
    if (
      list.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
      owned.set(path, status);
    }
  }
  return owned;
}

function rollUp(
  membership: ReadonlyMap<string, string>,
  files: ReadonlyMap<string, ChangeStatus>,
): ReadonlyMap<string, ChangeStatus> {
  const total = new Map<string, number>();
  const added = new Map<string, number>();
  const touched = new Map<string, number>();

  for (const [file, owner] of membership) {
    total.set(owner, (total.get(owner) ?? 0) + 1);
    const status = files.get(file);
    if (status === undefined) continue;
    touched.set(owner, (touched.get(owner) ?? 0) + 1);
    if (status === 'added') added.set(owner, (added.get(owner) ?? 0) + 1);
  }

  const rolled = new Map<string, ChangeStatus>();
  for (const [owner, count] of touched) {
    if (count === 0) continue;
    rolled.set(
      owner,
      added.get(owner) === total.get(owner) ? 'added' : 'modified',
    );
  }
  return rolled;
}
