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
import { Button } from '@kestack/web-platform/components/button';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { keys, useBound } from '../../../keys.ts';
import * as places from '../../../places/index.ts';
import { useMachineId } from '../connection/index.ts';
import { HomeLive } from './actor.ts';

/*
 * Home: pick a project, or open the Project Picker, as its keys would, to
 * find or make a folder under home. With no project yet, that is the only
 * thing on the page.
 */

/** Opens the Project Picker, as Ctrl+P does. */
function OpenProject({ variant }: { readonly variant: 'default' | 'outline' }) {
  const available = keys.useAvailableActions();
  const bound = useBound('app.projects');
  const action = available.find(({ id }) => id === 'app.projects');
  return (
    <Button
      type="button"
      variant={variant}
      disabled={action === undefined}
      onClick={() => action?.run()}
      className="self-start"
    >
      <FolderPlusIcon aria-hidden />
      Open a folder
      {bound !== null && <span className="text-xs opacity-70">{bound}</span>}
    </Button>
  );
}

export const HomeView = View.make(HomeLive, ({ root, children }) => {
  const machineId = useMachineId();
  const projects = useChild(children.projects, ({ model }) => model);
  const rows = (projects?.rows ?? [])
    .map(({ row }) => row)
    .sort((a, b) => a.name.localeCompare(b.name));
  // Projects the device holds draw at once; with none, a skeleton until the
  // server has answered, and only then is the list believed empty.
  if (projects?.caughtUp === true && rows.length === 0)
    return (
      <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Empty className="mx-auto max-w-lg">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpenIcon aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Open a folder to start a project</EmptyTitle>
            <EmptyDescription>
              Sessions with Claude and Codex run inside the folder you add.
              Removing a project later never touches its files.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="items-center">
            <OpenProject variant="default" />
          </EmptyContent>
        </Empty>
      </div>
    );
  return (
    <div {...root} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6 md:py-10">
        <section aria-label="Projects">
          {rows.length === 0 ? (
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
                    <Router.Link to={places.project(machineId, project.id)} />
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
        <OpenProject variant="outline" />
      </div>
    </div>
  );
});
