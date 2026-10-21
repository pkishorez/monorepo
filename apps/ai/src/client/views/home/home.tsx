import type { Project } from '@kestack/ai-toolkit/api';
import { useChild, View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@kestack/web-platform/components/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@kestack/web-platform/components/item';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Pages, router } from '../../../shared/pages/index.ts';
import { AddProjectField, AddProjectForm } from '../add-project/index.ts';
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
  if (settled && projects?.status === 'ready' && rows.length === 0)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
      </div>
    );
  return (
    <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 md:py-10">
        <section aria-label="Projects">
          {projects?.status !== 'ready' || rows.length === 0 ? (
            <div className="flex flex-col gap-2" aria-busy>
              {['w-40', 'w-28', 'w-36'].map((width) => (
                <div
                  key={width}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-3"
                >
                  <Skeleton className="size-4" />
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className={`h-3.5 ${width}`} />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ItemGroup className="gap-2">
              {rows.map((project) => (
                <Item
                  key={project.id}
                  role="listitem"
                  variant="outline"
                  size="sm"
                  render={
                    <Router.Link
                      to={router.Project({ projectId: project.id })}
                    />
                  }
                  className="group"
                >
                  <ItemMedia variant="icon">
                    <FolderIcon aria-hidden className="text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent className="min-w-0 gap-0.5">
                    <ItemTitle>{project.name}</ItemTitle>
                    <ItemDescription
                      title={project.path}
                      className="line-clamp-1 font-mono text-xs"
                    >
                      {project.path}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRightIcon
                      aria-hidden
                      className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </section>
        <section aria-labelledby="add-folder" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="add-folder" className="text-sm font-semibold">
              Add a folder
            </h2>
            <p className="text-sm text-muted-foreground">
              Paste its absolute path. Its sessions run inside it.
            </p>
          </div>
          <AddProjectField instance={children.addProject} />
        </section>
      </div>
    </div>
  );
});
