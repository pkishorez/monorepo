import type { FormEvent, KeyboardEvent } from 'react';
import { useState } from 'react';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@monorepo/frontend/components/ui/collapsible';
import { Input } from '@monorepo/frontend/components/ui/input';
import { Label } from '@monorepo/frontend/components/ui/label';
import {
  CheckIcon,
  ChevronDownIcon,
  FolderIcon,
  FolderPlusIcon,
  PlusIcon,
  Trash2Icon,
} from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';
import { useDevtoolsStore } from './store';

/**
 * The depcruise project picker: add a project by absolute path, open an existing
 * one, or delete it. Rendered inline on the home screen and inside the navigation
 * dialog. `onSelected` lets the dialog close itself when a project is chosen. The
 * server URL is configured separately via the header connection button.
 */
export function ProjectManager({ onSelected }: { onSelected?: () => void }) {
  const projects = useDevtoolsStore((s) => s.projects);
  const selectedPath = useDevtoolsStore((s) => s.selectedPath);
  const addProject = useDevtoolsStore((s) => s.addProject);
  const removeProject = useDevtoolsStore((s) => s.removeProject);
  const selectProject = useDevtoolsStore((s) => s.selectProject);

  const [pathDraft, setPathDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');

  const pathValid = pathDraft.trim().length > 0;

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    const path = pathDraft.trim();
    if (!path) return;
    addProject({ path, label: labelDraft.trim() || undefined });
    setPathDraft('');
    setLabelDraft('');
  };

  const handleSelect = (path: string) => {
    selectProject(path);
    onSelected?.();
  };

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && pathValid) {
      e.preventDefault();
      handleAdd(e);
    }
  };

  const [addOpen, setAddOpen] = useState(false);

  const addForm = (
    <form onSubmit={handleAdd} className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="devtools-add-path" className="sr-only">
          Absolute package path
        </Label>
        <Input
          id="devtools-add-path"
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onKeyDown={submitOnEnter}
          placeholder="/Users/you/repo/packages/some-pkg"
          className="font-mono text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Input
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={submitOnEnter}
          placeholder="Label (optional)"
        />
        <Button type="submit" disabled={!pathValid}>
          <PlusIcon className="size-4" />
          Add
        </Button>
      </div>
    </form>
  );

  // With no projects yet, the form is the whole screen: show it directly rather
  // than tucking it behind a disclosure and stacking redundant empty states.
  // The shell already supplies the heading, so render just the form here.
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 p-4">{addForm}</div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Project selection is the primary action: list it first and give it room. */}
      <section className="space-y-2.5">
        <ul className="space-y-1.5">
          {projects.map((p) => {
            const active = p.path === selectedPath;
            return (
              <li
                key={p.path}
                className={cn(
                  'group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/60 hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none"
                  onClick={() => handleSelect(p.path)}
                >
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-md',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {active ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <FolderIcon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p.label ?? p.path.split('/').pop()}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {p.path}
                    </span>
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Remove project"
                  className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => removeProject(p.path)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Adding a project is occasional setup: tuck the form behind a disclosure. */}
      <Collapsible
        open={addOpen}
        onOpenChange={setAddOpen}
        className="rounded-lg border border-border/60"
      >
        <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium outline-none">
          <FolderPlusIcon className="size-3.5 text-muted-foreground" />
          <span>Add a project</span>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 border-t border-border/60 px-3 py-4">
          <p className="text-xs text-muted-foreground">
            Point DevTools at a package by its absolute filesystem path.
          </p>
          {addForm}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
