import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'kui-toolkit/components/ui/dropdown-menu';
import {
  CheckIcon,
  ChevronsUpDownIcon,
  GitBranchIcon,
} from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/lib/utils';
import type { Worktree, WorktreeResolution } from '../../rpc/index.js';
import { currentWorktree } from './registry.js';

export function worktreeLabel(worktree: Worktree) {
  return worktree.branch ?? `detached ${worktree.head.slice(0, 7)}`;
}

export function shortenHome(path: string) {
  const match = /^\/Users\/[^/]+|^\/home\/[^/]+/.exec(path);
  return match ? `~${path.slice(match[0].length)}` : path;
}

/**
 * The header control that names the Worktree the current path is on and lets
 * the developer move to a Worktree sibling. Hidden outside git; a static label
 * when the repository has one Worktree.
 */
export function WorktreeSwitcher({
  resolution,
  onSelect,
  className,
}: {
  resolution: WorktreeResolution | null | undefined;
  onSelect: (siblingPath: string) => void;
  className?: string;
}) {
  if (!resolution || resolution.worktrees.length === 0) return null;
  const current = currentWorktree(resolution);
  const label = current ? worktreeLabel(current) : 'unknown worktree';
  const single = resolution.worktrees.length === 1;

  const face = (
    <>
      <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left font-mono text-xs">
        {label}
      </span>
      {single ? null : (
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </>
  );
  const faceClass = cn(
    'flex h-10 min-w-0 max-w-56 items-center gap-2 rounded-md border border-border/60 px-2.5 text-sm md:h-8',
    className,
  );

  if (single) {
    return (
      <div className={faceClass} title={current?.root}>
        {face}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          faceClass,
          'transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        )}
        title="Switch worktree"
        aria-label="Switch worktree"
      >
        {face}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Worktrees</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {resolution.worktrees.map((worktree) => (
            <WorktreeMenuItem
              key={worktree.root}
              worktree={worktree}
              active={worktree.root === resolution.current}
              onSelect={() => onSelect(worktree.siblingPath)}
            />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorktreeMenuItem({
  worktree,
  active,
  onSelect,
}: {
  worktree: Worktree;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onClick={onSelect}
      className="flex items-start gap-2"
      title={worktree.root}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {active ? <CheckIcon className="size-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs">
            {worktreeLabel(worktree)}
          </span>
          {worktree.primary ? (
            <span className="rounded bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              main
            </span>
          ) : null}
          {worktree.present ? null : (
            <span className="rounded bg-destructive/10 px-1 text-[10px] uppercase tracking-wide text-destructive">
              missing
            </span>
          )}
        </span>
        <span className="block truncate font-mono text-[11px] text-muted-foreground">
          {shortenHome(worktree.root)}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
