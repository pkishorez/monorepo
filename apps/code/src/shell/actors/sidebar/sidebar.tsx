import type { Project, Session } from '@kestack/ai-toolkit/api';
import { Router } from '@kestack/kabuki/routing';
import { revealInView } from '@kestack/use-keys/surfaces';
import {
  GitForkIcon,
  SettingsIcon,
} from '@kestack/web-platform/ui/components/lucide';
import {
  SidebarGroup,
  useAppShell,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@kestack/web-platform/recipes/frame';
import { Skeleton } from '@kestack/web-platform/ui/components/skeleton';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { keys, useBound } from '../../../keys.ts';
import * as places from '../../places/index.ts';
import type { Place } from '../../places/index.ts';
import type { OnMachine } from '../../replica/index.ts';
import { ago } from '../../../ui/time/index.ts';
import { StatusDot } from '../../../ui/status-dot/index.ts';
import {
  groupsOf,
  keyOf,
  projectPlace,
  type Row,
  rowsOf,
  sessionBeside,
  sessionPlace,
  SHOWN,
} from './rows.ts';
import {
  outOfReach,
  useHealth,
  useMachineName,
} from '../../connection/index.ts';
import { SettledLine, SettledList, settledOf } from './settled-list/index.ts';
import { SwipeToMove } from './swipe/index.ts';

/*
 * The sidebar: every Project of every Machine, one list, the most recently
 * active first, as a small muted heading over its unsettled Sessions, flat
 * (rows.ts). After a Project's name, its Machine's name in small text,
 * while there is more than one Machine; a Machine that does not answer
 * keeps what it last synced, its Projects marked by its Last Seen. The Project
 * open shows all its Sessions; any other its three most recent and "+N",
 * which shows the rest in place. A Session row is its title, bold while
 * Unseen, a fork glyph for a Fork, and a dot only when it asks for
 * attention. The plus beside the label opens
 * the Project Picker, as a popover. At the foot, "Settled · N" opens the
 * Settled List in place of the Projects.
 *
 * The whole sidebar is the `sidebar` Surface, which the App View draws. A
 * cursor goes through the rows shown, the foot's line last: j
 * and k move it, g g and Shift+G go to the first and the last, and Enter
 * opens the row and goes to the page, or, on "+N" or the foot's line, does
 * what a click does and stays. Escape goes back to the page. The cursor
 * follows the place open, and entering the sidebar opens it if it was shut.
 *
 * From the page, [ and ] open the unsettled Session before and after the
 * open one in the sidebar's order, across Projects, and Ctrl+[ and Ctrl+]
 * do so from anywhere, while typing too, going round past either end; one hidden behind "+N"
 * is shown first. The Session open is
 * scrolled into view whenever it changes, without taking focus.
 */

export function Places({
  route,
  projects,
  sessions,
  isUnseen,
  unsettling,
  projectPicker,
  onOpenSession,
  onUnsettle,
  onMove,
}: {
  readonly route: Place;
  readonly projects: {
    readonly rows: ReadonlyArray<OnMachine<Project>>;
    /** Whether some Machine's projects were never synced on this device. */
    readonly loading: boolean;
  };
  /** Every Session, Settled ones too. */
  readonly sessions: ReadonlyArray<OnMachine<Session>>;
  readonly isUnseen: (session: OnMachine<Session>) => boolean;
  /** The Session being Un-settled, and why its Machine refused, if it did. */
  readonly unsettling: {
    readonly machineId: string;
    readonly sessionId: string;
    readonly problem: string | null;
  } | null;
  /** The Project Picker, drawn by its plus. */
  readonly projectPicker: ReactNode;
  /** Moves the app to a session, as its link would. */
  readonly onOpenSession: (
    machineId: string,
    projectId: string,
    sessionId: string,
  ) => void;
  readonly onUnsettle: (machineId: string, sessionId: string) => void;
  /** A Session swiped to Settle it, or to un-Settle it. */
  readonly onMove: (session: OnMachine<Session>, settled: boolean) => void;
}) {
  const here = route._tag === 'Project' ? route : null;
  const openSession = here?.page?.sessionId ?? null;
  const hereProject =
    here === null ? null : { machineId: here.machineId, id: here.projectId };
  const open =
    here === null || hereProject === null
      ? null
      : openSession === null
        ? projectPlace(hereProject)
        : sessionPlace({ machineId: here.machineId, id: openSession });
  // Projects shown whole by their "+N", for as long as the sidebar is drawn.
  const [whole, setWhole] = useState<ReadonlySet<string>>(() => new Set());
  const [settledOpen, setSettledOpen] = useState(false);
  const shownWhole = (key: string) =>
    (hereProject !== null && key === keyOf(hereProject)) || whole.has(key);
  const showWhole = (key: string) =>
    setWhole((now) => (now.has(key) ? now : new Set([...now, key])));

  const groups = groupsOf(projects.rows, sessions);
  const rows = rowsOf(groups, shownWhole);
  const settled = settledOf(projects.rows, sessions);
  const toggleSettled = () => setSettledOpen((now) => !now);
  const stops: ReadonlyArray<Stop> = [
    ...(settledOpen
      ? settled.map(({ place }) => ({ place, opens: true }))
      : rows.map(({ place, kind }) => ({ place, opens: kind !== 'more' }))),
    { place: 'settled', opens: false },
  ];

  const surface = keys.useSurface('sidebar');
  // Lit, with its cursor drawn, only in Vim Mode; the keys are in it either way.
  const active = surface.state === 'active';
  const cursor = useCursor({
    stops,
    open,
    openProject: hereProject === null ? null : projectPlace(hereProject),
    active,
  });
  const shell = useAppShell();
  const picks = useBound('app.projects');
  // A sidebar entered from the keyboard is shown, in either Mode.
  useEffect(() => {
    if (surface.active && !shell.open) shell.setOpen(true);
  }, [surface.active]);
  // Its keys go back to the page.
  keys.useAction('sidebar.back', () => {});

  // The Session open is in view, however it was opened.
  useLayoutEffect(() => {
    if (open !== null) revealInView(cursor.element(open));
  }, [open, settledOpen]);

  const from =
    here === null
      ? null
      : {
          machineId: here.machineId,
          projectId: here.projectId,
          sessionId: openSession,
        };
  const before = sessionBeside(groups, from, -1);
  const after = sessionBeside(groups, from, 1);
  const go = (to: OnMachine<Session> | undefined) => {
    if (to === undefined) return;
    const key = keyOf({ machineId: to.machineId, id: to.projectId });
    const group = groups.find(({ project }) => keyOf(project) === key);
    if ((group?.sessions.indexOf(to) ?? 0) >= SHOWN) showWhole(key);
    setSettledOpen(false);
    onOpenSession(to.machineId, to.projectId, to.id);
  };
  keys.useAction('content.previousSession', () => go(before), {
    enabled: before !== undefined,
  });
  keys.useAction('content.nextSession', () => go(after), {
    enabled: after !== undefined,
  });
  // The same from anywhere, the sidebar and the Composer included.
  keys.useAction('app.previousSession', () => go(before), {
    enabled: before !== undefined,
  });
  keys.useAction('app.nextSession', () => go(after), {
    enabled: after !== undefined,
  });

  const at = (place: string) => (active && cursor.at === place) || undefined;
  const titles = new Map(
    sessions.map((session) => [keyOf(session), session.title]),
  );
  // Projects the device holds draw at once, of every Machine; with none, a
  // skeleton only while some Machine's were never synced here.
  const loading = groups.length === 0 && projects.loading;
  return (
    <div ref={cursor.list} className="flex min-h-full flex-col">
      {settledOpen ? (
        <SettledList
          listed={settled}
          open={
            here === null || openSession === null
              ? null
              : { machineId: here.machineId, id: openSession }
          }
          at={at}
          unsettling={unsettling}
          onUnsettle={onUnsettle}
          onMove={onMove}
          onClose={toggleSettled}
        />
      ) : (
        <SidebarGroup className="px-2 py-1">
          <SidebarGroupLabel className="h-7 justify-between pr-0">
            Projects
            {projectPicker}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {loading ? (
              <div className="flex flex-col gap-1">
                {['w-24', 'w-32', 'w-20'].map((width) => (
                  <div key={width} className="flex h-7 items-center px-2">
                    <Skeleton className={`h-3.5 ${width}`} />
                  </div>
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">
                No projects yet. Open a folder with the plus
                {picks === null ? '' : `, or ${picks}`}.
              </p>
            ) : (
              <SidebarMenu className="gap-1 max-md:gap-4">
                {groups.map(({ project }) => (
                  <ProjectGroup
                    key={keyOf(project)}
                    rows={rows.filter(
                      (row) => keyOf(row.project) === keyOf(project),
                    )}
                    here={here}
                    at={at}
                    titles={titles}
                    isUnseen={isUnseen}
                    onShowWhole={showWhole}
                    onMove={onMove}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      <div className="sticky bottom-0 mt-auto bg-sidebar pb-1">
        <SettledLine
          count={settled.length}
          open={settledOpen}
          cursor={at('settled')}
          onToggle={toggleSettled}
        />
      </div>
    </div>
  );
}

/**
 * A row: a finger's height, but 28px with a keyboard on a wide screen,
 * so a tablet with no keyboard keeps rows a finger can hit.
 */
const row = 'h-11 gap-2 px-2 py-0 keyboard:md:h-7 data-active:font-normal';
/** A Session's row: a little taller than a finger, to swipe, alike. */
const sessionRow =
  'h-12 gap-2 px-2 py-0 keyboard:md:h-7 data-active:font-normal';
const cursorRing = 'data-cursor:ring-2 data-cursor:ring-inset';

/** One Project's heading, its Sessions shown, and its "+N". */
function ProjectGroup({
  rows,
  here,
  at,
  titles,
  isUnseen,
  onShowWhole,
  onMove,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly here: Extract<Place, { readonly _tag: 'Project' }> | null;
  readonly at: (place: string) => true | undefined;
  /** Every Session's title, by `keyOf`, to name what a Fork came from. */
  readonly titles: ReadonlyMap<string, string>;
  readonly isUnseen: (session: OnMachine<Session>) => boolean;
  readonly onShowWhole: (key: string) => void;
  readonly onMove: (session: OnMachine<Session>, settled: boolean) => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenu className="gap-0">
        {rows.map((each) => {
          switch (each.kind) {
            case 'project':
              return (
                <SidebarMenuItem key={each.place}>
                  <SidebarMenuButton
                    data-place={each.place}
                    data-cursor={at(each.place)}
                    isActive={
                      here?.machineId === each.project.machineId &&
                      here.projectId === each.project.id &&
                      here.page === undefined
                    }
                    className={`${row} ${cursorRing} text-xs font-medium text-muted-foreground data-active:font-medium max-md:mt-2 max-md:text-sm max-md:text-sidebar-foreground`}
                    render={
                      <Router.Link
                        to={places.project(
                          each.project.machineId,
                          each.project.id,
                        )}
                        title={`${each.project.path}: a new session`}
                      />
                    }
                  >
                    <ProjectLabel project={each.project} />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            case 'session': {
              const { session } = each;
              const original =
                session.forkedFrom === null
                  ? null
                  : titles.get(
                      keyOf({
                        machineId: session.machineId,
                        id: session.forkedFrom.sessionId,
                      }),
                    ) || 'Untitled session';
              const title = session.title || 'Untitled session';
              return (
                <SidebarMenuItem key={each.place}>
                  <SwipeToMove
                    settled={false}
                    onMove={(settled) => onMove(session, settled)}
                  >
                    <SidebarMenuButton
                      data-place={each.place}
                      data-cursor={at(each.place)}
                      isActive={
                        here?.machineId === session.machineId &&
                        here.page?.sessionId === session.id
                      }
                      className={`${sessionRow} ${cursorRing}`}
                      render={
                        <Router.Link
                          to={places.session(
                            session.machineId,
                            session.projectId,
                            session.id,
                          )}
                          title={
                            original === null
                              ? title
                              : `${title}\nForked from ${original}`
                          }
                        />
                      }
                    >
                      {original !== null && (
                        <GitForkIcon
                          role="img"
                          aria-label={`Forked from ${original}`}
                          className="size-3! text-muted-foreground/70"
                        />
                      )}
                      <span
                        className={`min-w-0 flex-1 truncate ${isUnseen(session) ? 'font-semibold text-sidebar-foreground' : ''}`}
                      >
                        {title}
                      </span>
                      <StatusDot status={session.status} />
                    </SidebarMenuButton>
                  </SwipeToMove>
                </SidebarMenuItem>
              );
            }
            case 'more':
              return (
                <SidebarMenuItem key={each.place}>
                  <SidebarMenuButton
                    data-place={each.place}
                    data-cursor={at(each.place)}
                    aria-label={`Show ${each.hidden} more session${each.hidden === 1 ? '' : 's'} of ${each.project.name}`}
                    onClick={() => onShowWhole(keyOf(each.project))}
                    className={`${row} ${cursorRing} text-xs text-muted-foreground tabular-nums`}
                  >
                    {/* On a phone, room to say what it does. */}
                    <span className="md:hidden">Show {each.hidden} more</span>
                    <span className="max-md:hidden">+{each.hidden}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
          }
        })}
      </SidebarMenu>
    </SidebarMenuItem>
  );
}

/**
 * A Project's name, then its Machine's while there is more than one, and,
 * while the Machine does not answer, when it was last seen.
 */
function ProjectLabel({ project }: { readonly project: OnMachine<Project> }) {
  const machine = useMachineName(project.machineId);
  const health = useHealth(project.machineId);
  const seen = outOfReach(health) ? `seen ${ago(health.lastSeen)}` : null;
  const note = [machine, seen].filter((each) => each !== null).join(' · ');
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span className="min-w-0 truncate">{project.name}</span>
      {note !== '' && (
        <span
          className="shrink-0 truncate text-[11px] font-normal text-muted-foreground/70"
          title={
            seen === null
              ? undefined
              : 'Not answering: what it last synced is shown'
          }
        >
          {note}
        </span>
      )}
    </span>
  );
}

/** A place the cursor stops at, and whether Enter on it goes to the page. */
interface Stop {
  readonly place: string;
  readonly opens: boolean;
}

/**
 * The cursor through the rows shown, UI state alone. It follows the place
 * open, and is put on it as the Surface is entered; on a row that is no
 * longer shown, it falls back to the place open, or its project. Enter
 * clicks the row it is on, so a link moves the router as for a click, and
 * then, on a link, enters the page.
 */
function useCursor({
  stops,
  open,
  openProject,
  active,
}: {
  readonly stops: ReadonlyArray<Stop>;
  readonly open: string | null;
  /** The project of the place open, shown when a session of it is not. */
  readonly openProject: string | null;
  readonly active: boolean;
}) {
  const { enter } = keys.useKeyboard();
  const [cursor, setCursor] = useState<string | null>(null);
  const [was, setWas] = useState({ active, open });
  if (active !== was.active || open !== was.open) {
    setWas({ active, open });
    if ((active && !was.active) || open !== was.open) setCursor(open);
  }
  const placeAt = (place: string | null) =>
    place === null ? undefined : stops.find((stop) => stop.place === place);
  const fallback = placeAt(open) ?? placeAt(openProject) ?? stops[0];
  const stop = placeAt(cursor) ?? fallback;
  // Read by the keys, which may repeat faster than a render.
  const latest = useRef(stop);
  latest.current = stop;
  const list = useRef<HTMLDivElement | null>(null);
  const element = (place: string | undefined) =>
    place === undefined
      ? null
      : list.current?.querySelector<HTMLElement>(
          `[data-place="${CSS.escape(place)}"]`,
        );
  const go = (to: Stop | undefined) => {
    if (to === undefined) return;
    latest.current = to;
    setCursor(to.place);
    revealInView(element(to.place));
  };
  const by = (step: number) => {
    const index =
      latest.current === undefined ? -1 : stops.indexOf(latest.current);
    go(stops[Math.min(Math.max(index + step, 0), stops.length - 1)]);
  };
  keys.useAction('sidebar.next', () => by(1));
  keys.useAction('sidebar.previous', () => by(-1));
  keys.useAction('sidebar.first', () => go(stops[0]));
  keys.useAction('sidebar.last', () => go(stops.at(-1)));
  keys.useAction('sidebar.open', () => {
    const on = latest.current;
    element(on?.place)?.click();
    if (on?.opens) enter('content');
  });
  return { at: stop?.place, list, element };
}

/** The way to Settings, at the sidebar's foot. */
export function SettingsLink({ route }: { readonly route: Place }) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={route._tag === 'Settings'}
          render={<Router.Link to={places.settings()} />}
        >
          <SettingsIcon aria-hidden className="text-muted-foreground" />
          <span>Settings</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
