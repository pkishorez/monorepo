import type { FormEvent, KeyboardEvent } from 'react';
import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'kui-toolkit/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'kui-toolkit/components/ui/empty';
import { Input } from 'kui-toolkit/components/ui/input';
import { Label } from 'kui-toolkit/components/ui/label';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderPlusIcon,
  GitBranchIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'kui-toolkit/lucide';
import { cn } from 'kui-toolkit/utils';
import type { ProjectEntry, RegistryTool, Worktree } from '../../rpc/index.js';
import { basename, useProjectRegistry } from './registry.js';
import { shortenHome, worktreeLabel } from './worktree-switcher.js';

type Copy = {
  /** "monorepo" or "project": the noun the Tool uses. */
  noun: string;
  placeholder: string;
  hint: string;
};

const COPY: Record<RegistryTool, Copy> = {
  monoverse: {
    noun: 'monorepo',
    placeholder: '/Users/you/repo',
    hint: 'Point DevTools at a pnpm workspace root by its absolute filesystem path.',
  },
  laymos: {
    noun: 'project',
    placeholder: '/Users/you/repo/packages/some-pkg',
    hint: 'Point DevTools at a folder that holds a laymos.config.json by its absolute path.',
  },
};

/**
 * The Project picker: the registry entries of one Tool, each expandable into
 * its Worktrees when there are several. Selecting an entry or a Worktree row
 * emits the folder to analyse; the caller puts it in the URL. Entries can be
 * added, edited, and removed here.
 */
export function ProjectPicker({
  tool,
  currentPath,
  onSelect,
}: {
  tool: RegistryTool;
  currentPath: string | null;
  onSelect: (path: string) => void;
}) {
  const copy = COPY[tool];
  const registry = useProjectRegistry(tool);
  const entries = registry.query.data;
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const addForm = (
    <EntryForm
      idPrefix={`${tool}-add`}
      copy={copy}
      submitLabel="Add"
      submitIcon={<PlusIcon className="size-4" />}
      pending={registry.add.isPending}
      onSubmit={async (input) => {
        await registry.add.mutateAsync(input);
        setAddOpen(false);
      }}
    />
  );

  if (registry.query.isPending) {
    return (
      <p className="p-4 text-sm text-muted-foreground">Loading {copy.noun}s…</p>
    );
  }
  if (registry.query.error) {
    return (
      <p className="p-4 text-sm text-destructive">
        Could not load the {copy.noun} list: {String(registry.query.error)}
      </p>
    );
  }
  if (!entries || entries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center p-4">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No {copy.noun}s added</EmptyTitle>
              <EmptyDescription>{copy.hint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
        <div className="rounded-lg border border-border/60 p-4">{addForm}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ul className="space-y-1.5">
        {entries.map((entry) =>
          editingId === entry.id ? (
            <li
              key={entry.id}
              className="rounded-lg border border-border/60 p-3"
            >
              <EntryForm
                idPrefix={`${tool}-edit-${entry.id}`}
                copy={copy}
                initial={{ path: entry.path, label: entry.label }}
                submitLabel="Save"
                submitIcon={<CheckIcon className="size-4" />}
                pending={registry.update.isPending}
                onCancel={() => setEditingId(null)}
                onSubmit={async (input) => {
                  await registry.update.mutateAsync({ id: entry.id, ...input });
                  setEditingId(null);
                }}
              />
            </li>
          ) : (
            <EntryRow
              key={entry.id}
              entry={entry}
              currentPath={currentPath}
              onSelect={onSelect}
              onEdit={() => setEditingId(entry.id)}
              onRemove={() => registry.remove.mutate(entry.id)}
            />
          ),
        )}
      </ul>

      <Collapsible
        open={addOpen}
        onOpenChange={setAddOpen}
        className="rounded-lg border border-border/60"
      >
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium outline-none">
          <FolderPlusIcon className="size-3.5 text-muted-foreground" />
          <span>Add a {copy.noun}</span>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 border-t border-border/60 px-3 py-4">
          <p className="text-xs text-muted-foreground">{copy.hint}</p>
          {addForm}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function EntryRow({
  entry,
  currentPath,
  onSelect,
  onEdit,
  onRemove,
}: {
  entry: ProjectEntry;
  currentPath: string | null;
  onSelect: (path: string) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const worktrees = entry.worktrees?.worktrees ?? [];
  const expandable = worktrees.length > 1;
  const containsCurrent =
    currentPath !== null &&
    (entry.path === currentPath ||
      worktrees.some((w) => w.siblingPath === currentPath));
  const [open, setOpen] = useState(containsCurrent);
  const title = entry.label ?? basename(entry.path);

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Edit"
        aria-label={`Edit ${title}`}
        className="size-10 shrink-0 text-muted-foreground sm:size-7 sm:opacity-0 sm:transition-opacity sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
        onClick={onEdit}
      >
        <PencilIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Remove"
        aria-label={`Remove ${title}`}
        className="size-10 shrink-0 text-muted-foreground hover:text-destructive sm:size-7 sm:opacity-0 sm:transition-opacity sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
        onClick={onRemove}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </>
  );

  const head = (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors',
        containsCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border/60 hover:bg-muted/60',
        expandable && open && 'rounded-b-none border-b-0',
      )}
    >
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
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
          {entry.path === currentPath ? (
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
      {actions}
      {expandable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={open ? 'Hide worktrees' : `Show ${worktrees.length} worktrees`}
          aria-label={open ? 'Hide worktrees' : 'Show worktrees'}
          aria-expanded={open}
          className="size-10 shrink-0 text-muted-foreground sm:size-7"
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDownIcon
            className={cn('size-4 transition-transform', open && 'rotate-180')}
          />
        </Button>
      ) : null}
    </div>
  );

  if (!expandable) return <li>{head}</li>;

  return (
    <li>
      {head}
      {open ? (
        <ul className="divide-y divide-border/60 rounded-b-lg border border-border/60 bg-muted/20">
          {worktrees.map((worktree) => (
            <WorktreeRow
              key={worktree.root}
              worktree={worktree}
              active={worktree.siblingPath === currentPath}
              onSelect={() => onSelect(worktree.siblingPath)}
            />
          ))}
        </ul>
      ) : null}
    </li>
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
        className={cn(
          'flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none',
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

function EntryForm({
  idPrefix,
  copy,
  initial,
  submitLabel,
  submitIcon,
  pending,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  copy: Copy;
  initial?: { path: string; label: string | null };
  submitLabel: string;
  submitIcon: React.ReactNode;
  pending: boolean;
  onSubmit: (input: { path: string; label: string | null }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [pathDraft, setPathDraft] = useState(initial?.path ?? '');
  const [labelDraft, setLabelDraft] = useState(initial?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const pathValid = pathDraft.trim().length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!pathValid || pending) return;
    setError(null);
    try {
      await onSubmit({
        path: pathDraft.trim(),
        label: labelDraft.trim() || null,
      });
      if (!initial) {
        setPathDraft('');
        setLabelDraft('');
      }
    } catch (cause) {
      setError(messageOf(cause));
    }
  };

  const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && pathValid) {
      event.preventDefault();
      void submit(event);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-path`} className="sr-only">
          Absolute {copy.noun} path
        </Label>
        <Input
          id={`${idPrefix}-path`}
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={copy.placeholder}
          autoFocus={initial !== undefined}
          className="h-11 font-mono text-base sm:h-9 sm:text-sm"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor={`${idPrefix}-label`} className="sr-only">
          Label
        </Label>
        <Input
          id={`${idPrefix}-label`}
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder="Label (optional)"
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
        <Button
          type="submit"
          className="min-h-11 sm:min-h-0"
          disabled={!pathValid || pending}
        >
          {submitIcon}
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 sm:min-h-0"
            onClick={onCancel}
          >
            <XIcon className="size-4" />
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error)
    return String(error.message);
  return String(error);
}

/** The picker in a dialog, for the header switcher. Closes itself on selection. */
export function ProjectPickerDialog({
  tool,
  currentPath,
  open,
  onOpenChange,
  onSelect,
}: {
  tool: RegistryTool;
  currentPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}) {
  const copy = COPY[tool];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Navigate to {copy.noun}</DialogTitle>
          <DialogDescription>
            Pick a {copy.noun} or one of its worktrees, or add a new one.
          </DialogDescription>
        </DialogHeader>
        <ProjectPicker
          tool={tool}
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
