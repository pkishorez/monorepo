import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
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
  ServerIcon,
  SettingsIcon,
  Trash2Icon,
} from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/utils';
import { isValidBaseUrl, useDevtoolsStore } from './store';

/**
 * The shared project picker: a DevTools server URL field, an add-by-absolute-path
 * form, and the list of added projects with select/delete. Rendered inline on the
 * home screen and inside the navigation dialog. `onSelected` lets the dialog close
 * itself when a project is chosen.
 */
export function ProjectManager({ onSelected }: { onSelected?: () => void }) {
  const devUrl = useDevtoolsStore((s) => s.devUrl);
  const setDevUrl = useDevtoolsStore((s) => s.setDevUrl);
  const projects = useDevtoolsStore((s) => s.projects);
  const selectedPath = useDevtoolsStore((s) => s.selectedPath);
  const addProject = useDevtoolsStore((s) => s.addProject);
  const removeProject = useDevtoolsStore((s) => s.removeProject);
  const selectProject = useDevtoolsStore((s) => s.selectProject);

  const [urlDraft, setUrlDraft] = useState(devUrl);
  const [pathDraft, setPathDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');

  const trimmedUrl = urlDraft.trim();
  const urlValid = isValidBaseUrl(trimmedUrl);
  const urlDirty = trimmedUrl.replace(/\/+$/, '') !== devUrl;
  const pathValid = pathDraft.trim().length > 0;

  const commitUrl = () => {
    const trimmed = trimmedUrl.replace(/\/+$/, '');
    if (isValidBaseUrl(trimmed)) setDevUrl(trimmed);
  };

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

  const [configOpen, setConfigOpen] = useState(projects.length === 0);

  return (
    <div className="space-y-5">
      {/* Project selection is the primary action: list it first and give it room. */}
      <section className="space-y-2.5">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border/60 px-4 py-10 text-center">
            <FolderIcon className="size-5 text-muted-foreground" />
            <p className="text-sm font-medium">No projects yet</p>
            <p className="text-xs text-muted-foreground">
              Add one below to get started.
            </p>
          </div>
        ) : (
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
        )}
      </section>

      {/* Server URL and add-project forms are occasional setup: tuck them behind a disclosure. */}
      <Collapsible
        open={configOpen}
        onOpenChange={setConfigOpen}
        className="rounded-lg border border-border/60"
      >
        <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium outline-none">
          <SettingsIcon className="size-3.5 text-muted-foreground" />
          <span>Add a project &amp; server settings</span>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-5 border-t border-border/60 px-3 py-4">
          <Section
            icon={<FolderPlusIcon className="size-3.5" />}
            title="Add a project"
            description="Point DevTools at a package by its absolute filesystem path."
          >
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
          </Section>

          <Section
            icon={<ServerIcon className="size-3.5" />}
            title="DevTools server"
            description="Base URL of the local DevTools RPC server (no trailing /rpc)."
          >
            <div className="space-y-1.5">
              <Label htmlFor="devtools-dev-url" className="sr-only">
                DevTools server URL
              </Label>
              <div className="flex gap-2">
                <Input
                  id="devtools-dev-url"
                  type="url"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onBlur={commitUrl}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && urlValid) {
                      e.preventDefault();
                      commitUrl();
                    }
                  }}
                  placeholder="http://127.0.0.1:14400"
                  aria-invalid={!urlValid}
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!urlValid || !urlDirty}
                  onClick={commitUrl}
                >
                  Save
                </Button>
              </div>
              {trimmedUrl.length > 0 && !urlValid ? (
                <p className="text-xs text-destructive">
                  Enter a valid http(s) URL.
                </p>
              ) : null}
            </div>
          </Section>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/** A labelled form section with an icon header and optional helper text. */
function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
