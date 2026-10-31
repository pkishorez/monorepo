import { View, useChildren } from '@kestack/kabuki/react';
import { useEffect } from 'react';
import { Router } from '@kestack/kabuki/routing';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@kestack/web-platform/ui/components/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@kestack/web-platform/ui/components/item';
import { Button } from '@kestack/web-platform/ui/components/button';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
} from 'lucide-react';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import type { Project } from '@kestack/connect/code';
import { keys, useBound } from '../../commands.ts';
import { GUTTERED } from '../../../../../../ui/page/gutter/index.ts';
import * as routes from '../../../../../routes/index.ts';
import { type OnConnection } from '../../../connection/records/index.ts';
import { useConnectionName } from '../../../connection/link/index.ts';
import { HomeLive, readyOf, showingOf } from './actor.ts';

/*
 * Home: pick a project of any Connection, each named by its Connection's name
 * while there is more than one, or open the Project Picker, as its keys
 * would, to find or make a folder under a Connection's home. With no project
 * yet, that is the only thing on the page.
 */

/**
 * Opens the Project Picker, as its keys do: centred under an empty state,
 * at the start under the list.
 */
function OpenProject({ variant }: { readonly variant: 'default' | 'outline' }) {
  const available = keys.useAvailableActions();
  const quick = useBound('app.projects');
  const anywhere = useBound('app.projectsAnywhere');
  // `o` is Vim Mode's; out of it, as with no keyboard, the one that works
  // anywhere opens it.
  const action =
    available.find(({ id }) => id === 'app.projects') ??
    available.find(({ id }) => id === 'app.projectsAnywhere');
  const bound = action?.id === 'app.projects' ? quick : anywhere;
  return (
    <Button
      type="button"
      variant={variant}
      disabled={action === undefined}
      onClick={() => action?.run()}
      className={`h-11 keyboard:h-9 ${variant === 'default' ? 'self-center' : 'self-start'}`}
    >
      <FolderPlusIcon aria-hidden />
      Open a folder
      {/* Its key means nothing with no keyboard. */}
      {bound !== null && (
        <span className="hidden text-xs opacity-70 keyboard:inline">
          {bound}
        </span>
      )}
    </Button>
  );
}

/** A quiet list shaped like the projects, for Connections this device never synced. */
function Loading() {
  return (
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
  );
}

/** One project, with its Connection's name while there is more than one. */
function ProjectItem({ project }: { readonly project: OnConnection<Project> }) {
  const connection = useConnectionName(project.connectionId);
  return (
    <Item
      role="listitem"
      variant="outline"
      size="sm"
      render={
        <Router.Link to={routes.project(project.connectionId, project.id)} />
      }
      className="group"
    >
      <ItemMedia variant="icon">
        <FolderIcon aria-hidden className="text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5">
        <ItemTitle>
          {project.name}
          {connection !== null && (
            <span className="text-xs font-normal text-muted-foreground">
              {connection}
            </span>
          )}
        </ItemTitle>
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
  );
}

export const HomeView = View.make(HomeLive, ({ root, model, children }) => {
  const projects = useChildren(children.projects, ({ model }) => model);
  // Until the list kept here and each Connection's projects held here are
  // read, nothing, so what it holds shows in one step; with no Connection
  // listed, or none to be had from Cloud Connect, the Connections say why.
  // Projects the device holds draw at once, even of a Connection that does
  // not answer.
  const showing = showingOf(model, projects);
  if (showing === 'nothing') return null;
  const rows = projects
    .flatMap((each) => each.rows.map(({ row }) => row))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (showing === 'empty')
    return (
      <div
        {...root}
        className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto ${GUTTERED}`}
      >
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
    <div
      {...root}
      className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto ${GUTTERED}`}
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-8 sm:px-6 md:py-10">
        <section aria-label="Projects">
          {showing === 'waiting' ? (
            <Loading />
          ) : (
            <ItemGroup className="gap-2">
              {rows.map((project) => (
                <ProjectItem
                  key={`${project.connectionId}/${project.id}`}
                  project={project}
                />
              ))}
            </ItemGroup>
          )}
        </section>
        <OpenProject variant="outline" />
      </div>
    </div>
  );
});

/**
 * Draws nothing: says once that home can be drawn whole, the list kept
 * here and each Connection's projects held here read, so Layout first draws
 * it with them.
 */
export const HomeReady = View.make(HomeLive, ({ model, children, send }) => {
  const projects = useChildren(children.projects, ({ model }) => model);
  const ready = readyOf(model, projects);
  useEffect(() => {
    if (ready && !model.ready) send({ _tag: 'Ready' });
  }, [ready, model.ready]);
  return null;
});
