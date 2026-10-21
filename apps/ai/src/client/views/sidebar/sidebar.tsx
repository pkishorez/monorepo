import type { Project, Session } from '@kestack/ai-toolkit/api';
import type { Handle } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import {
  FolderIcon,
  GitForkIcon,
  SettingsIcon,
} from '@kestack/web-platform/components/lucide';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@kestack/web-platform/recipes/frame';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { router, type Pages, type Route } from '../../../shared/pages/index.ts';
import { AddProjectPopover } from '../add-project/index.ts';
import { JobCount, SessionStatus } from '../session-status/index.ts';
import { useSettled } from '../settled/index.ts';

/*
 * The sidebar's list: every project by name, and under the one open, its
 * sessions, newest first, each marked with how it stands, how many
 * Background Jobs it runs, and, quietly, whether it is a fork. The plus
 * beside the label adds a folder, in a popover. Settings sit at the foot.
 */

export function Places({
  route,
  projects,
  sessions,
  jobs,
  addProject,
}: {
  readonly route: Route;
  readonly projects: {
    readonly status: string;
    readonly rows: ReadonlyArray<Project>;
  };
  readonly sessions: ReadonlyArray<Session>;
  /** How many Background Jobs each session runs, by id. */
  readonly jobs: ReadonlyMap<string, number>;
  readonly addProject: Handle<typeof Pages.AddProjectLive>;
}) {
  const settled = useSettled();
  const here = route._tag === 'Project' ? route : null;
  const sorted = [...projects.rows].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="justify-between pr-0">
        Projects
        <AddProjectPopover instance={addProject} />
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {projects.status === 'loading' ||
          (sorted.length === 0 && !settled) ? (
            ['w-24', 'w-32', 'w-20'].map((width) => (
              <SidebarMenuItem
                key={width}
                className="flex h-8 items-center gap-2 px-2"
              >
                <Skeleton className="size-4" />
                <Skeleton className={`h-4 ${width}`} />
              </SidebarMenuItem>
            ))
          ) : sorted.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              No projects yet. Add a folder with the plus.
            </li>
          ) : (
            sorted.map((project) => {
              const active = here?.projectId === project.id;
              const own = active
                ? sessions
                    .filter((session) => session.projectId === project.id)
                    .sort((a, b) => b.createdAt - a.createdAt)
                : [];
              return (
                <SidebarMenuItem key={project.id}>
                  <SidebarMenuButton
                    isActive={active && here?.page === undefined}
                    render={
                      <Router.Link
                        to={router.Project({ projectId: project.id })}
                        title={project.path}
                      />
                    }
                  >
                    <FolderIcon aria-hidden className="text-muted-foreground" />
                    <span>{project.name}</span>
                  </SidebarMenuButton>
                  {own.length > 0 && (
                    <SidebarMenuSub>
                      {own.map((session) => (
                        <SidebarMenuSubItem key={session.id}>
                          <SidebarMenuSubButton
                            isActive={here?.page?.sessionId === session.id}
                            render={
                              <Router.Link
                                to={router.Project.Session({
                                  projectId: project.id,
                                  sessionId: session.id,
                                })}
                                title={session.title || undefined}
                              />
                            }
                          >
                            {session.forkedFrom !== null && (
                              <GitForkIcon
                                role="img"
                                aria-label="Forked"
                                className="size-3 shrink-0 text-muted-foreground/70"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate">
                              {session.title || 'Untitled session'}
                            </span>
                            <JobCount count={jobs.get(session.id) ?? 0} />
                            <SessionStatus status={session.status} />
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              );
            })
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** The way to Settings, at the sidebar's foot. */
export function SettingsLink({ route }: { readonly route: Route }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={route._tag === 'Settings'}
          render={<Router.Link to={router.Settings()} />}
        >
          <SettingsIcon aria-hidden className="text-muted-foreground" />
          <span>Settings</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
