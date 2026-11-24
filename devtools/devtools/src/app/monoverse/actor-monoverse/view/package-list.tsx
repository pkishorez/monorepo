import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { SearchIcon } from 'lucide-react';

import { CheckMark } from './check-mark.js';
import {
  orderPackages,
  type PackageChanges,
  type PackageChoice,
} from './package-menu.js';

/*
 * The Packages held open in the left panel, one quiet line each: the name,
 * without the scope most of them share, what its monoverse.json found,
 * and while Changes is on how many files changed, in the colour they roll
 * up to. The one shown is the only row highlighted; All packages leads,
 * the way back to the repo view. A search field narrows the list once it
 * is long.
 */

/** Past this many Packages, the list gets a search field. */
const searchFrom = 10;

const tone = {
  added: 'text-added',
  modified: 'text-changed',
  deleted: 'text-removed',
} as const;

/** The scope most Packages share, as `@scope/`, so their names can drop it. */
function sharedScope(packages: ReadonlyArray<PackageChoice>): string | null {
  const counts = new Map<string, number>();
  for (const { name } of packages) {
    const slash = name.indexOf('/');
    if (name.startsWith('@') && slash > 0) {
      const scope = name.slice(0, slash + 1);
      counts.set(scope, (counts.get(scope) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [scope, count] of counts)
    if (
      count * 2 > packages.length &&
      (best === null || count > counts.get(best)!)
    )
      best = scope;
  return best;
}

export function PanelPackageList({
  packages,
  current,
  changes,
  onChoose,
}: {
  packages: ReadonlyArray<PackageChoice>;
  /** By its folder; null: the repo view. */
  current: string | null;
  changes: PackageChanges | null;
  onChoose: (path: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const scope = useMemo(() => sharedScope(packages), [packages]);
  const short = (name: string) =>
    scope !== null && name.startsWith(scope) ? name.slice(scope.length) : name;
  const needle = query.trim().toLowerCase();
  const matches = (one: PackageChoice) =>
    needle === '' ||
    one.name.toLowerCase().includes(needle) ||
    one.path.toLowerCase().includes(needle);
  const { changed, rest } = orderPackages(packages, current, changes);
  const groups =
    changes === null
      ? [{ heading: null, items: rest.filter(matches), quiet: false }]
      : [
          {
            heading: 'Changed',
            items: changed.filter(matches),
            quiet: false,
          },
          {
            heading: 'Unchanged',
            items: rest.filter(matches),
            quiet: changes.unchanged === 'dim',
          },
        ];

  const row = (
    key: string,
    path: string | null,
    label: string,
    title: string,
    end: ReactNode,
    quiet = false,
  ) => {
    const here = path === current;
    return (
      <li key={key}>
        <button
          type="button"
          title={title}
          aria-current={here ? 'page' : undefined}
          onClick={() => {
            if (!here) onChoose(path);
          }}
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            here
              ? 'bg-muted font-medium text-foreground'
              : cn(
                  'hover:bg-muted/60 hover:text-foreground',
                  quiet ? 'text-muted-foreground/60' : 'text-foreground/85',
                ),
          )}
        >
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {end}
        </button>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      {packages.length < searchFrom ? null : (
        <label className="mx-1 flex h-7 shrink-0 items-center gap-2 rounded-md bg-muted/50 px-2 text-muted-foreground transition-colors duration-150 focus-within:bg-muted focus-within:text-foreground">
          <SearchIcon aria-hidden className="size-3.5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a package…"
            aria-label="Find a package"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      )}
      <ul className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 pb-1">
        {needle === ''
          ? row(
              'all',
              null,
              'All packages',
              'The repository, every Package in it',
              <span className="text-xs text-muted-foreground tabular-nums">
                {packages.length}
              </span>,
            )
          : null}
        {groups.map(({ heading, items, quiet }) =>
          items.length === 0 ? null : (
            <li key={heading ?? 'packages'} className="contents">
              {heading === null ? null : (
                <div
                  aria-hidden
                  className="px-2 pt-3 pb-1 text-[11px] font-medium text-muted-foreground"
                >
                  {heading} · {items.length}
                </div>
              )}
              <ul className="contents">
                {items.map((one) => {
                  const change = changes?.of.get(one.path);
                  return row(
                    one.path,
                    one.path,
                    short(one.name),
                    `${one.name} · ${one.path}`,
                    <>
                      <CheckMark check={one.check} />
                      {change === undefined ? null : (
                        <span
                          className={cn(
                            'shrink-0 text-xs tabular-nums',
                            tone[change.status],
                          )}
                        >
                          {change.count}
                        </span>
                      )}
                    </>,
                    quiet,
                  );
                })}
              </ul>
            </li>
          ),
        )}
        {needle !== '' && groups.every(({ items }) => items.length === 0) ? (
          <li className="px-2 py-4 text-xs text-muted-foreground">
            No package matches “{query.trim()}”.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
