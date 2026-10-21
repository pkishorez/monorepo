import type { Project } from '@kestack/ai-toolkit/api';
import { useChild, View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
} from '@kestack/web-platform/components/lucide';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@kestack/web-platform/components/empty';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Pages, router } from '../../../shared/pages/index.ts';
import { AddProjectField, AddProjectForm } from '../add-project/index.ts';
import { PageBar } from '../page-bar/index.ts';
import { useSettled } from '../settled/index.ts';

/*
 * Home: pick a project, or add a folder as one. With none yet, adding one
 * is the only thing on the page.
 */

export const HomeView = View.make(Pages.HomeLive, ({ root, children }) => {
  const projects = useChild(children.projects, ({ model }) => model);
  const settled = useSettled();
  const rows = (projects?.rows ?? [])
    .map(({ row }) => row as Project)
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div {...root} className="flex min-h-0 flex-1 flex-col">
      <PageBar title="Projects" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {settled && projects?.status === 'ready' && rows.length === 0 ? (
          <Empty className="mx-auto max-w-lg">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpenIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Add a folder to start a project</EmptyTitle>
              <EmptyDescription>
                Sessions with Claude and Codex run inside the folder you add.
                Removing a project later never touches its files.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="w-full max-w-md items-stretch text-left">
              <AddProjectForm instance={children.addProject} />
            </EmptyContent>
          </Empty>
        ) : (
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-6 py-10">
            <section aria-label="Projects" className="flex flex-col">
              {projects?.status !== 'ready' || rows.length === 0 ? (
                [0, 1, 2].map((key) => (
                  <div key={key} className="flex items-center gap-3 py-3">
                    <Skeleton className="size-4" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))
              ) : (
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {rows.map((project) => (
                    <li key={project.id}>
                      <Router.Link
                        to={router.Project({ projectId: project.id })}
                        className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                      >
                        <FolderIcon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {project.name}
                          </span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {project.path}
                          </span>
                        </span>
                        <ChevronRightIcon
                          aria-hidden
                          className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                        />
                      </Router.Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">Add a folder</h2>
              <p className="mb-2 text-sm text-muted-foreground">
                Paste its absolute path; its sessions run inside it.
              </p>
              <AddProjectField instance={children.addProject} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
});
