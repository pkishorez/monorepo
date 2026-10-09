import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@kstackz/web-platform/components/alert-dialog';
import { Button } from '@kstackz/web-platform/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kstackz/web-platform/components/dialog';
import {
  CheckIcon,
  GitBranchIcon,
  Trash2Icon,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import type { ProjectEntry, Worktree } from '../../rpc/index.js';
import { EntryForm } from './entry-form.js';
import { basename, useProjectRegistry } from './registry.js';
import { shortenHome, worktreeLabel } from './worktree-switcher.js';

export function entryTitle(entry: ProjectEntry) {
  return entry.label ?? basename(entry.path);
}

/**
 * Everything about one entry the picker rows leave out: its Worktrees, each
 * opening the entry there; its path and label; and removing it, after a
 * confirmation. `entry` null keeps the dialog closed.
 */
export function ManageEntryDialog({
  entry,
  currentPath,
  onClose,
  onSelect,
}: {
  entry: ProjectEntry | null;
  currentPath: string | null;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  // Keep the last entry drawn while the dialog animates closed.
  const [shown, setShown] = useState(entry);
  if (entry !== null && entry !== shown) setShown(entry);
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
        {shown ? (
          <ManageEntry
            key={shown.id}
            entry={shown}
            currentPath={currentPath}
            onClose={onClose}
            onSelect={(path) => {
              onClose();
              onSelect(path);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ManageEntry({
  entry,
  currentPath,
  onClose,
  onSelect,
}: {
  entry: ProjectEntry;
  currentPath: string | null;
  onClose: () => void;
  onSelect: (path: string) => void;
}) {
  const registry = useProjectRegistry();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const title = entryTitle(entry);
  const worktrees = entry.worktrees?.worktrees ?? [];

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{title}</DialogTitle>
        <DialogDescription className="truncate font-mono text-xs">
          {shortenHome(entry.path)}
        </DialogDescription>
      </DialogHeader>

      {worktrees.length > 0 ? (
        <section
          aria-labelledby={`${entry.id}-worktrees`}
          className="space-y-2"
        >
          <h3
            id={`${entry.id}-worktrees`}
            className="text-xs font-medium text-muted-foreground"
          >
            Worktrees
          </h3>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {worktrees.map((worktree) => (
              <WorktreeRow
                key={worktree.root}
                worktree={worktree}
                active={worktree.siblingPath === currentPath}
                onSelect={() => onSelect(worktree.siblingPath)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby={`${entry.id}-edit`} className="space-y-2">
        <h3
          id={`${entry.id}-edit`}
          className="text-xs font-medium text-muted-foreground"
        >
          Edit
        </h3>
        <EntryForm
          idPrefix={`edit-${entry.id}`}
          initial={{ path: entry.path, label: entry.label }}
          submitLabel="Save"
          submitIcon={<CheckIcon className="size-4" />}
          pending={registry.update.isPending}
          onSubmit={async (input) => {
            await registry.update.mutateAsync({ id: entry.id, ...input });
            onClose();
          }}
        />
      </section>

      <DialogFooter className="sm:justify-start">
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 sm:min-h-0"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2Icon className="size-4" />
          Remove
        </Button>
      </DialogFooter>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {title} from Monoverse?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder stays on your disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                registry.remove.mutate(entry.id);
                setConfirmOpen(false);
                onClose();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function WorktreeRow({
  worktree,
  active,
  onSelect,
}: {
  worktree: Worktree;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        title={worktree.siblingPath}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          active && 'bg-primary/5',
        )}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {active ? (
            <CheckIcon className="size-3.5 text-primary" />
          ) : (
            <GitBranchIcon className="size-3.5" />
          )}
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
      </button>
    </li>
  );
}
