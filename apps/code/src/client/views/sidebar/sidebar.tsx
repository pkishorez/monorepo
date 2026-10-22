import type { Project, Session } from '@kestack/ai-toolkit/api';
import type { Handle } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { revealInView } from '@kestack/use-keys/surfaces';
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  GitForkIcon,
  SettingsIcon,
} from '@kestack/web-platform/components/lucide';
import {
  SidebarGroup,
  useAppShell,
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
import { useEffect, useRef, useState } from 'react';
import { router, type Pages, type Route } from '../../../shared/pages/index.ts';
import { keys } from '../../keys.ts';
import { AddProjectPopover } from '../add-project/index.ts';
import { JobCount, SessionStatus } from '../session-status/index.ts';
import { useSettled } from '../settled/index.ts';
import {
  projectPlace,
  type Row,
  sessionBeside,
  sessionPlace,
  shown,
  treeOf,
} from './rows.ts';

/*
 * The sidebar's tree: every project by name, and under each one unfolded,
 * its sessions, newest first, each marked with how it stands, how many
 * Background Jobs it runs, and, quietly, whether it is a fork. A folded
 * project with a session at work says so on its own row. The chevron
 * beside a project folds and unfolds it; the project open is unfolded
 * whenever it is opened. The plus beside the label adds a folder, in a
 * popover. Settings sit at the foot.
 *
 * The whole sidebar is the `sidebar` Surface, which the App View draws. In
 * Vim Mode a cursor goes through the rows shown: j and k move it, g g and
 * Shift+G go to the first and the last, h folds the project it is on, or
 * the one around the session it is on, moving to it, l unfolds it, and
 * Enter opens the row and goes to the page. The cursor follows the place
 * open, and entering the sidebar opens it if it was shut.
 *
 * From the page, Ctrl+[ and Ctrl+] open the session before and after the
 * open one among those shown, across projects, even while typing.
 */

export function Places({
  route,
  projects,
  sessions,
  jobs,
  addProject,
  onOpenSession,
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
  /** Moves the app to a session, as its link would. */
  readonly onOpenSession: (projectId: string, sessionId: string) => void;
}) {
  const settled = useSettled();
  const here = route._tag === 'Project' ? route : null;
  const tree = treeOf(projects.rows, sessions);
  const open =
    here === null
      ? null
      : here.page === undefined
        ? projectPlace(here.projectId)
        : sessionPlace(here.page.sessionId);
  const unfolding = useUnfolded({
    place: open,
    project: here?.projectId ?? null,
  });
  const { unfolded } = unfolding;
  const rows = tree.filter((row) => shown(row, unfolded));
  const active = keys.useSurface('sidebar').state === 'active';
  const cursor = useCursor({
    rows,
    open,
    openProject: here?.projectId ?? null,
    active,
    unfolding,
  });
  const shell = useAppShell();
  // A sidebar entered from the keyboard is shown.
  useEffect(() => {
    if (active && !shell.open) shell.setOpen(true);
  }, [active]);

  const beside = (by: 1 | -1) => sessionBeside(tree, unfolded, open, by);
  const before = beside(-1);
  const after = beside(1);
  const go = (row: Row | undefined) => {
    if (row?.session) onOpenSession(row.projectId, row.session.id);
  };
  keys.useAction('content.previousSession', () => go(before), {
    enabled: before !== undefined,
  });
  keys.useAction('content.nextSession', () => go(after), {
    enabled: after !== undefined,
  });

  const at = (place: string) => (active && cursor.at === place) || undefined;
  const loading =
    projects.status === 'loading' || (tree.length === 0 && !settled);
  return (
    <SidebarGroup ref={cursor.list}>
      <SidebarGroupLabel className="justify-between pr-0">
        Projects
        <AddProjectPopover instance={addProject} />
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {loading ? (
            ['w-24', 'w-32', 'w-20'].map((width) => (
              <SidebarMenuItem
                key={width}
                className="flex h-8 items-center gap-2 px-2"
              >
                <Skeleton className="size-4" />
                <Skeleton className={`h-4 ${width}`} />
              </SidebarMenuItem>
            ))
          ) : tree.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">
              No projects yet. Add a folder with the plus.
            </li>
          ) : (
            rows
              .filter((row) => row.kind === 'project')
              .map(({ project, place }) => {
                const own = rows.filter(
                  (row) =>
                    row.kind === 'session' && row.projectId === project.id,
                );
                const isOpen = unfolded.has(project.id);
                const working =
                  !isOpen &&
                  sessions.some(
                    (session) =>
                      session.projectId === project.id &&
                      session.status === 'running',
                  );
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      data-place={place}
                      data-cursor={at(place)}
                      className="pr-8 data-cursor:ring-2 data-cursor:ring-inset"
                      isActive={
                        here?.projectId === project.id &&
                        here?.page === undefined
                      }
                      render={
                        <Router.Link
                          to={router.Project({ projectId: project.id })}
                          title={project.path}
                        />
                      }
                    >
                      {isOpen ? (
                        <FolderOpenIcon
                          aria-hidden
                          className="text-muted-foreground"
                        />
                      ) : (
                        <FolderIcon
                          aria-hidden
                          className="text-muted-foreground"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {project.name}
                      </span>
                      {working && <SessionStatus status="running" />}
                    </SidebarMenuButton>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Fold' : 'Unfold'} ${project.name}`}
                      title={isOpen ? 'Fold' : 'Unfold'}
                      onClick={() => unfolding.set(project.id, !isOpen)}
                      className="absolute top-2.5 right-1 grid size-6 place-items-center md:top-1 rounded-md text-muted-foreground/70 outline-hidden ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                    >
                      <ChevronRightIcon
                        aria-hidden
                        className={`size-3.5 ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </button>
                    {own.length > 0 && (
                      <SidebarMenuSub>
                        {own.map(({ session, place }) =>
                          session === null ? null : (
                            <SidebarMenuSubItem key={session.id}>
                              <SidebarMenuSubButton
                                data-place={place}
                                data-cursor={at(place)}
                                className="data-cursor:ring-2 data-cursor:ring-inset"
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
                          ),
                        )}
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

/**
 * Which projects are unfolded: UI state alone, which the chevrons and the
 * keys both change. Opening a place unfolds its project.
 */
function useUnfolded(open: {
  readonly place: string | null;
  readonly project: string | null;
}) {
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(
    () => new Set(open.project === null ? [] : [open.project]),
  );
  const [was, setWas] = useState(open.place);
  if (open.place !== was) {
    setWas(open.place);
    if (open.project !== null && !unfolded.has(open.project))
      setUnfolded(new Set([...unfolded, open.project]));
  }
  const set = (projectId: string, on: boolean) =>
    setUnfolded((now) => {
      if (now.has(projectId) === on) return now;
      const next = new Set(now);
      if (on) next.add(projectId);
      else next.delete(projectId);
      return next;
    });
  return { unfolded, set };
}

/**
 * The cursor through the rows shown, UI state alone. It follows the place
 * open, and is put on it as the Surface is entered; on a row that is no
 * longer shown, it falls back to the place open, or its project. Enter
 * clicks the link it is on, so the router moves as for a click; its Action
 * then enters the page.
 */
function useCursor({
  rows,
  open,
  openProject,
  active,
  unfolding,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly open: string | null;
  /** The project of the place open, shown when a session of it is not. */
  readonly openProject: string | null;
  readonly active: boolean;
  readonly unfolding: ReturnType<typeof useUnfolded>;
}) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [was, setWas] = useState({ active, open });
  if (active !== was.active || open !== was.open) {
    setWas({ active, open });
    if ((active && !was.active) || open !== was.open) setCursor(open);
  }
  const placeAt = (place: string | null) =>
    place === null ? undefined : rows.find((row) => row.place === place);
  const fallback =
    placeAt(open) ??
    placeAt(openProject === null ? null : projectPlace(openProject)) ??
    rows[0];
  const row = placeAt(cursor) ?? fallback;
  // Read by the keys, which may repeat faster than a render.
  const latest = useRef(row);
  latest.current = row;
  const list = useRef<HTMLDivElement | null>(null);
  const element = (place: string | undefined) =>
    place === undefined
      ? null
      : list.current?.querySelector<HTMLElement>(
          `[data-place="${CSS.escape(place)}"]`,
        );
  const go = (to: Row | undefined) => {
    if (to === undefined) return;
    latest.current = to;
    setCursor(to.place);
    revealInView(element(to.place));
  };
  const by = (step: number) => {
    const index =
      latest.current === undefined ? -1 : rows.indexOf(latest.current);
    go(rows[Math.min(Math.max(index + step, 0), rows.length - 1)]);
  };
  keys.useAction('sidebar.next', () => by(1));
  keys.useAction('sidebar.previous', () => by(-1));
  keys.useAction('sidebar.first', () => go(rows[0]));
  keys.useAction('sidebar.last', () => go(rows.at(-1)));
  keys.useAction('sidebar.collapse', () => {
    const on = latest.current;
    if (on === undefined) return;
    unfolding.set(on.projectId, false);
    if (on.kind === 'session') go(placeAt(projectPlace(on.projectId)));
  });
  keys.useAction('sidebar.expand', () => {
    const on = latest.current;
    if (on?.kind === 'project') unfolding.set(on.projectId, true);
  });
  keys.useAction('sidebar.open', () => element(latest.current?.place)?.click());
  return { at: row?.place, list };
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
