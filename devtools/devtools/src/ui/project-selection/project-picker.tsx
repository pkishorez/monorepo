import { useState } from 'react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@kstackz/web-platform/components/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@kstackz/web-platform/components/empty';
import {
  CheckIcon,
  EllipsisIcon,
  FolderIcon,
  PlusIcon,
} from '@kstackz/web-platform/components/lucide';
import { cn } from '@kstackz/web-platform/components/utils';
import type { ProjectEntry } from '../../rpc/index.js';
import { EntryForm, entryHint } from './entry-form.js';
import { ManageEntryDialog, entryTitle } from './manage-entry.js';
import { useProjectRegistry } from './registry.js';
import { shortenHome } from './worktree-switcher.js';

/**
 * The Project picker: every entry added to Monoverse, each by its own folder.
 * Selecting a row emits that folder; the caller puts it in the URL. Adding
 * opens its own dialog; a row's more button opens its Manage dialog, with
 * its Worktrees, its Edit fields, and Remove.
 */
export function ProjectPicker({
  currentPath,
  onSelect,
}: {
  currentPath: string | null;
  onSelect: (path: string) => void;
}) {
  const registry = useProjectRegistry();
  const entries = registry.query.data;
  const [addOpen, setAddOpen] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = entries?.find((entry) => entry.id === managingId) ?? null;

  if (registry.query.isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }
  if (registry.query.error) {
    return (
      <p className="p-4 text-sm text-destructive">
        Could not load the list: {String(registry.query.error)}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-0"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon className="size-4" />
          Add
        </Button>
      </div>

      {!entries || entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing added yet</EmptyTitle>
            <EmptyDescription>{entryHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              currentPath={currentPath}
              onSelect={onSelect}
              onManage={() => setManagingId(entry.id)}
            />
          ))}
        </ul>
      )}

      <AddEntryDialog open={addOpen} onOpenChange={setAddOpen} />
      <ManageEntryDialog
        entry={managing}
        currentPath={currentPath}
        onClose={() => setManagingId(null)}
        onSelect={onSelect}
      />
    </div>
  );
}

function EntryRow({
  entry,
  currentPath,
  onSelect,
  onManage,
}: {
  entry: ProjectEntry;
  currentPath: string | null;
  onSelect: (path: string) => void;
  onManage: () => void;
}) {
  const containsCurrent =
    currentPath !== null &&
    (entry.path === currentPath ||
      (entry.worktrees?.worktrees.some((w) => w.siblingPath === currentPath) ??
        false));
  const title = entryTitle(entry);

  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors',
        containsCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border/60 hover:bg-muted/60',
      )}
    >
      <button
        type="button"
        aria-current={containsCurrent ? 'true' : undefined}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => onSelect(entry.path)}
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md',
            containsCurrent
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {containsCurrent ? (
            <CheckIcon className="size-4" />
          ) : (
            <FolderIcon className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {shortenHome(entry.path)}
          </span>
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Manage"
        aria-label={`Manage ${title}`}
        className="size-10 shrink-0 text-muted-foreground sm:size-8"
        onClick={onManage}
      >
        <EllipsisIcon className="size-4" />
      </Button>
    </li>
  );
}

function AddEntryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const registry = useProjectRegistry();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)] sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Add to Monoverse</DialogTitle>
          <DialogDescription>{entryHint}</DialogDescription>
        </DialogHeader>
        <EntryForm
          idPrefix="add"
          submitLabel="Add"
          submitIcon={<PlusIcon className="size-4" />}
          pending={registry.add.isPending}
          onSubmit={async (input) => {
            await registry.add.mutateAsync(input);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The picker in a dialog, for the header switcher. Closes itself on selection. */
export function ProjectPickerDialog({
  currentPath,
  open,
  onOpenChange,
  onSelect,
}: {
  currentPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Open in Monoverse</DialogTitle>
          <DialogDescription>
            Pick a monorepo or package you added, or add one.
          </DialogDescription>
        </DialogHeader>
        <ProjectPicker
          currentPath={currentPath}
          onSelect={(path) => {
            onOpenChange(false);
            onSelect(path);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
