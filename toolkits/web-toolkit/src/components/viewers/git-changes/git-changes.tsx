import { useState } from 'react';
import type { Branch, ChangeStatus } from 'laymos';

import { ChevronDown, GitBranch, Search } from '#lib/lucide';
import { Input } from '#components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { cn } from '#lib/utils';

export interface GitOptions {
  // Off hides the change overlay entirely, whatever git reports.
  readonly showChanges: boolean;
  readonly includeUnchanged: boolean;
}

export const defaultGitOptions: GitOptions = {
  showChanges: true,
  includeUnchanged: true,
};

// The Base ref 'HEAD' means the working tree's uncommitted changes; any other
// value is a branch name, whose Change set already carries uncommitted work
// on top, since a Base ref diffs against the working tree, never a commit.
export const uncommittedBaseRef = 'HEAD';

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

/**
 * Derives each owner's standing in a Change set from the files it owns: added
 * when every owned file is added, modified when any is added or modified.
 * Owners with no changed file are absent.
 */
export function rollUpChanges(
  membership: ReadonlyMap<string, string>,
  files: ReadonlyMap<string, ChangeStatus>,
): ReadonlyMap<string, ChangeStatus> {
  const total = new Map<string, number>();
  const added = new Map<string, number>();
  const touched = new Set<string>();

  for (const [file, owner] of membership) {
    total.set(owner, (total.get(owner) ?? 0) + 1);
    const status = files.get(file);
    if (status === undefined) continue;
    touched.add(owner);
    if (status === 'added') added.set(owner, (added.get(owner) ?? 0) + 1);
  }

  const rolled = new Map<string, ChangeStatus>();
  for (const owner of touched) {
    rolled.set(
      owner,
      added.get(owner) === total.get(owner) ? 'added' : 'modified',
    );
  }
  return rolled;
}

export function changedPathsUnder(
  files: ReadonlyMap<string, ChangeStatus>,
  prefixes: string | readonly string[],
): ReadonlyMap<string, ChangeStatus> {
  const list = typeof prefixes === 'string' ? [prefixes] : prefixes;
  const owned = new Map<string, ChangeStatus>();
  for (const [path, status] of files) {
    if (
      list.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    ) {
      owned.set(path, status);
    }
  }
  return owned;
}

/**
 * The git comparison menu every Tool shows: whether changes are drawn,
 * whether unchanged owners stay visible, and which Base ref they are measured
 * against. `ownerLabel` names what the Tool marks, such as "modules".
 */
export function ChangesMenu({
  options,
  baseRef,
  branches,
  hasChanges,
  ownerLabel,
  onOptionsChange,
  onBaseRefChange,
}: {
  readonly options: GitOptions;
  readonly baseRef: string;
  readonly branches: readonly Branch[];
  readonly hasChanges: boolean;
  readonly ownerLabel: string;
  readonly onOptionsChange: (options: GitOptions) => void;
  readonly onBaseRefChange?: (baseRef: string) => void;
}) {
  const [branchSearch, setBranchSearch] = useState('');
  const filteredBranches = branches.filter(({ name }) =>
    name.toLocaleLowerCase().includes(branchSearch.trim().toLocaleLowerCase()),
  );
  const comparing =
    baseRef === uncommittedBaseRef ? 'Uncommitted changes' : baseRef;
  const summary = !options.showChanges
    ? 'Git changes off'
    : hasChanges
      ? comparing
      : `No changes · ${comparing}`;
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setBranchSearch('');
      }}
    >
      <DropdownMenuTrigger
        aria-label="Git comparison options"
        title="Git comparison options"
        className="flex size-10 items-center justify-center gap-2 rounded-md border border-border/60 bg-background text-sm text-foreground outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 md:h-8 md:w-auto md:max-w-56 md:justify-between md:px-2.5"
      >
        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="hidden truncate md:inline">{summary}</span>
        <ChevronDown className="hidden size-3.5 shrink-0 text-muted-foreground md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1rem))]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Git changes</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            className="min-h-11 md:min-h-8"
            checked={options.showChanges}
            onCheckedChange={(showChanges) =>
              onOptionsChange({ ...options, showChanges })
            }
          >
            Show git changes
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className="min-h-11 md:min-h-8"
            checked={options.includeUnchanged}
            disabled={!options.showChanges}
            onCheckedChange={(includeUnchanged) =>
              onOptionsChange({ ...options, includeUnchanged })
            }
          >
            Include unchanged {ownerLabel}
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        {options.showChanges && onBaseRefChange !== undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Compare against</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={baseRef}
                onValueChange={onBaseRefChange}
              >
                <DropdownMenuRadioItem
                  className="min-h-11 md:min-h-8"
                  value={uncommittedBaseRef}
                >
                  Uncommitted changes
                </DropdownMenuRadioItem>
                {branches.length > 0 && (
                  <div
                    className="relative px-1.5 py-1"
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={branchSearch}
                      onChange={(event) => setBranchSearch(event.target.value)}
                      placeholder="Search branches…"
                      aria-label="Search branches"
                      className="h-11 pl-9 text-base md:h-9 md:text-sm"
                    />
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto">
                  {filteredBranches.map((branch) => (
                    <DropdownMenuRadioItem
                      className="min-h-11 md:min-h-8"
                      key={branch.name}
                      value={branch.name}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {branch.name}
                      </span>
                      {branch.current && (
                        <span className="text-xs text-muted-foreground">
                          Current
                        </span>
                      )}
                    </DropdownMenuRadioItem>
                  ))}
                  {filteredBranches.length === 0 && branches.length > 0 && (
                    <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No matching branches
                    </p>
                  )}
                </div>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
