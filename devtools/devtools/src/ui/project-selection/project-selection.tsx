import { useState } from 'react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  ChevronsUpDownIcon,
  FolderIcon,
  RotateCwIcon,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import { ProjectPickerDialog } from './project-picker.js';
import {
  basename,
  currentWorktree,
  findEntryForPath,
  useProjectRegistry,
  useReload,
  useWorktrees,
} from './registry.js';
import { WorktreeSwitcher } from './worktree-switcher.js';

export { ProjectPicker } from './project-picker.js';
export { MissingProjectState } from './missing-project.js';
export { useReload, useWorktrees } from './registry.js';

/**
 * The header for Monoverse: the switcher that opens the picker, the Worktree
 * switcher for the current path, and the reload button. `path` is whatever
 * the URL says; `onSelect` writes a new path back to it.
 */
export function ProjectSelectionHeader({
  path,
  onSelect,
}: {
  path: string | null;
  onSelect: (path: string) => void;
}) {
  const registry = useProjectRegistry();
  const worktrees = useWorktrees(path);
  const reload = useReload();
  const [dialogOpen, setDialogOpen] = useState(false);

  const entry = findEntryForPath(registry.query.data, path);
  const label =
    path === null ? null : (entry?.label ?? basename(entry?.path ?? path));

  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        title={path ?? undefined}
        className={cn(
          'flex h-10 min-w-0 max-w-64 flex-1 items-center gap-2 rounded-md border border-border/60 px-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:h-8 md:w-64',
          label ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">
          {label ?? 'Select a folder'}
        </span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {path ? (
        <WorktreeSwitcher
          resolution={worktrees.data}
          onSelect={onSelect}
          className="hidden md:flex"
        />
      ) : null}
      {path ? (
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10 shrink-0 text-muted-foreground hover:text-foreground md:size-8"
          onClick={reload.request}
          aria-label="Reload"
          title="Reload"
        >
          <RotateCwIcon className="size-3.5" />
        </Button>
      ) : null}
      <ProjectPickerDialog
        currentPath={path}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={onSelect}
      />
    </div>
  );
}

/** True when the path is inside git and its Worktree does not contain the folder. */
export function isMissingInWorktree(
  resolution: ReturnType<typeof useWorktrees>['data'],
) {
  const current = currentWorktree(resolution);
  return current !== null && current.present === false;
}
