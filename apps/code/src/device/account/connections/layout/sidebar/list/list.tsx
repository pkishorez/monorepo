import type { Project, Session } from '@kestack/connect/code';
import { Router } from '@kestack/kabuki/routing';
import { revealInView } from '@kestack/use-keys/surfaces';
import {
  ChevronRightIcon,
  FolderGit2Icon,
  FolderPlusIcon,
  GitForkIcon,
  PlusIcon,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useAppShell,
} from '@kestack/web-platform/recipes/frame';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keys, useBound } from '../../commands.ts';
import { outOfReach } from '../../../connection/link/index.ts';
import * as routes from '../../../../../routes/index.ts';
import type { Route } from '../../../../../routes/index.ts';
import { type OnConnection } from '../../../connection/records/index.ts';
import {
  pillOf,
  StandingDot,
  standingOf,
  useHealth,
  useHealths,
} from '../../../connection/link/index.ts';
import { ago } from '../../../../../../ui/labels/status/index.ts';
import { StatusWord } from '../../../../../../ui/labels/status/index.ts';
import {
  branchOf,
  connectionPlace,
  countOf,
  type Entry,
  type Group,
  groupedOf,
  keyOf,
  projectPlace,
  sessionBeside,
  sessionPlace,
  shownOf,
} from './rows/rows.ts';
import { SettledList, settledOf } from './settled/settled.tsx';
import { SwipeToMove } from './moves/swipe/swipe.tsx';
import { arrive, ArriveItem } from './rows/arrive/arrive.tsx';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

/*
 * The sidebar: on a wide screen, Open project first, which opens the
 * Project Picker as its keys do; then every unsettled Session of every
 * Connection under its Project's heading, the Projects and their Sessions
 * the most recently active first (`rows/`); while every Connection is
 * shown and there is more than one, under its Connection's name first,
 * said once, small and uppercase, quieter than the headings, with room
 * above: a green dot while linked, else a grey one, with when it was last
 * seen at the right once it is out of reach. A click or Enter on the name
 * collapses its Projects under it, saying how many, and opens them again;
 * the cursor and [ ] pass over what it hides. A heading is its Project's
 * name, with the branch its folder is on as quiet mono text; anywhere on it
 * or its plus opens its Project's new session, and it is lit while that is
 * open. Its Sessions hang under it from a thin guide line. A row is one
 * line: its title, bold while Unseen, a fork glyph for a Fork; its branch,
 * only when it is not the heading's, so its own Worktree's, with a Worktree
 * glyph, said without Code's prefix; and its status at the right, as
 * quietly as it can be said: a mark, or how long ago, level with the title
 * (`ui/status-word`), or, loud on purpose, a "Question" pill while its agent
 * waits on an Agent Question. The Projects have more room above than the
 * rows between them, so the list reads as a list. A row under a pointer is
 * half lit, so the open one still stands out. A Connection out of reach
 * keeps what it last synced, its Projects and rows quieter, with no plus,
 * and, its name shown, last. Last of all, "Settled"
 * with how many, quieter, opens the Settled List under it, and closes it. While
 * nothing is held and some Connection's were never synced here, each such
 * Connection is listed instead, saying how far it got: downloading
 * cloudflared, opening its tunnel, linking. Its foot, the two buttons
 * that float over it on a phone, is `edges/foot/`.
 *
 * The whole sidebar is the `sidebar` Surface, which the App View draws. A
 * cursor goes through the Connections' names, the headings and rows shown,
 * "Settled" last: j and k
 * move it, g g and Shift+G go to the first and the last, and Enter opens
 * the row and goes to the page, or, on "Settled" or a Connection's name,
 * opens or closes what is under it and stays.
 * Escape goes back to the page. The cursor follows the place open, and
 * entering the sidebar opens it if it was shut.
 *
 * From the page, [ and ] open the Session before and after the open one in
 * the order drawn, and Ctrl+[ and Ctrl+] do so from anywhere, while typing
 * too, going round past either end. The Session open is scrolled into
 * view whenever it changes, without taking focus.
 */

/**
 * On touch, the open Session's row is only tinted, a press barely shows,
 * and none shows while a finger swipes the row (`SwipeRow`'s
 * `data-swiping`): the row in motion is enough.
 */
const TOUCH_ROW =
  'touch:data-active:bg-sidebar-accent/25! touch:data-active:text-sidebar-foreground! touch:active:bg-sidebar-accent/20! in-data-swiping:bg-transparent!';

/** A row under a pointer, half lit, the open one still in full. */
const HOVER_ROW =
  'hover:bg-sidebar-accent/50 data-active:hover:bg-sidebar-accent';

export function Places({
  read,
  route,
  projects,
  sessions,
  connections,
  collapsed,
  onCollapse,
  isUnseen,
  isAsking,
  onOpenSession,
  onUnsettle,
  onMove,
}: {
  /**
   * The Connections read, as one key: rows added under it arrive live and move
   * in; under a new one, as the Filter or the list changes, every row is
   * drawn as it is, none moving (`rows/drawn.ts`).
   */
  readonly read: string;
  readonly route: Route;
  readonly projects: {
    readonly rows: ReadonlyArray<OnConnection<Project>>;
    /** The Connections whose projects never synced on this device; null while none was ever listed. */
    readonly waiting: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
    }> | null;
  };
  /** Every Session, Settled ones too. */
  readonly sessions: ReadonlyArray<OnConnection<Session>>;
  /** The Connections' names to draw the Projects under, or null to mix them unnamed (`rows/namesOf`). */
  readonly connections: ReadonlyMap<string, string> | null;
  /** The Connections whose Projects are hidden under their name, while they are named. */
  readonly collapsed: ReadonlyArray<string>;
  /** A Connection's name clicked: its Projects hidden, or shown again. */
  readonly onCollapse: (connectionId: string) => void;
  readonly isUnseen: (session: OnConnection<Session>) => boolean;
  /** Whether its agent waits on an Agent Question. */
  readonly isAsking: (session: OnConnection<Session>) => boolean;
  /** Moves the app to a session, as its link would. */
  readonly onOpenSession: (
    connectionId: string,
    projectId: string,
    sessionId: string,
  ) => void;
  readonly onUnsettle: (connectionId: string, sessionId: string) => void;
  /** A Session swiped to Settle it, or to un-Settle it. */
  readonly onMove: (session: OnConnection<Session>, settled: boolean) => void;
}) {
  const here = route._tag === 'Project' ? route : null;
  const openSession = here?.page?.sessionId ?? null;
  const from =
    here === null || openSession === null
      ? null
      : { connectionId: here.connectionId, sessionId: openSession };
  // A Project's new session open lights its heading, if it is listed.
  const heading =
    here === null || here.page !== undefined
      ? null
      : projectPlace({ connectionId: here.connectionId, id: here.projectId });
  const open =
    heading ??
    (from === null
      ? null
      : sessionPlace({ connectionId: from.connectionId, id: from.sessionId }));
  const [settledOpen, setSettledOpen] = useState(false);
  const healthOf = useHealths();
  const away = (connectionId: string) => outOfReach(healthOf(connectionId));
  const listed = groupedOf(projects.rows, sessions, connections, away);
  // Only a Connection named can be collapsed.
  const folded = new Set(connections === null ? [] : collapsed);
  const groups = shownOf(listed, folded);
  const settled = settledOf(projects.rows, sessions);
  const toggleSettled = () => setSettledOpen((now) => !now);
  const stops: ReadonlyArray<Stop> = [
    ...listed.flatMap((group) => [
      ...(group.connection === null
        ? []
        : [{ place: connectionPlace(group.connectionId), opens: false }]),
      ...(folded.has(group.connectionId)
        ? []
        : [
            { place: group.place, opens: true },
            ...group.sessions.map(({ place }) => ({ place, opens: true })),
          ]),
    ]),
    { place: 'settled', opens: false },
    ...(settledOpen
      ? settled.map(({ place }) => ({ place, opens: true }))
      : []),
  ];

  const surface = keys.useSurface('sidebar');
  // Lit, with its cursor drawn, only in Vim Mode; the keys are in it either way.
  const active = surface.state === 'active';
  const cursor = useCursor({ stops, open, active });
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

  const before = sessionBeside(groups, from, -1);
  const after = sessionBeside(groups, from, 1);
  const go = (to: OnConnection<Session> | undefined) => {
    if (to === undefined) return;
    setSettledOpen(false);
    onOpenSession(to.connectionId, to.projectId, to.id);
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
  // Sessions the device holds draw at once, of every Connection; with none,
  // how far each Connection never synced here got. Both count what is
  // listed, collapsed or not: a collapsed Connection still shows its name.
  const waiting =
    listed.length === 0 &&
    projects.rows.length === 0 &&
    (projects.waiting === null || projects.waiting.length > 0);
  return (
    <MotionConfig reducedMotion="user">
      <div ref={cursor.list} className="flex flex-col px-2 pb-1">
        <>
          <OpenProject />
          {waiting ? (
            <Waiting connections={projects.waiting} />
          ) : listed.length === 0 ? (
            <p className="px-3 py-2 text-[15px] text-pretty text-muted-foreground keyboard:md:text-sm">
              No sessions yet. Start one with the plus
              {picks === null ? '' : `, or ${picks}`}: pick a folder, then say
              what to do.
            </p>
          ) : (
            <section aria-label="Sessions" className="pb-5">
              <SidebarMenu className="gap-0">
                <AnimatePresence key={read} initial={false}>
                  {listed.flatMap((group, index) => {
                    const quiet = away(group.connectionId);
                    const name =
                      group.connection === null
                        ? []
                        : [
                            <ConnectionLabel
                              key={connectionPlace(group.connectionId)}
                              connectionId={group.connectionId}
                              name={group.connection}
                              first={index === 0}
                              collapsed={folded.has(group.connectionId)}
                              count={countOf(listed, group.connectionId)}
                              at={at}
                              onToggle={() => onCollapse(group.connectionId)}
                            />,
                          ];
                    if (folded.has(group.connectionId)) return name;
                    return [
                      ...name,
                      <ProjectHeading
                        key={group.place}
                        group={group}
                        first={index === 0 || group.connection !== null}
                        open={open === group.place}
                        quiet={quiet}
                        at={at}
                      />,
                      ...group.sessions.map((entry) => (
                        <SessionRow
                          key={entry.place}
                          entry={entry}
                          heading={group.branch}
                          quiet={quiet}
                          here={here}
                          at={at}
                          titles={titles}
                          isUnseen={isUnseen}
                          isAsking={isAsking}
                          onMove={onMove}
                        />
                      )),
                    ];
                  })}
                </AnimatePresence>
              </SidebarMenu>
            </section>
          )}
          {/* A heading like the days', so what opens under it reads as its own; a finger's height to hit. */}
          <section aria-label="Settled">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  data-place="settled"
                  data-cursor={at('settled')}
                  aria-expanded={settledOpen}
                  onClick={toggleSettled}
                  className={`h-11 gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground/80 hover:bg-transparent hover:text-sidebar-foreground active:bg-sidebar-accent/60 keyboard:md:h-7 keyboard:md:text-xs keyboard:md:tracking-wide ${cursorRing}`}
                >
                  <span>Settled</span>
                  <span className="font-normal tabular-nums">
                    {settled.length}
                  </span>
                  <ChevronRightIcon
                    aria-hidden
                    className={`size-3.5! transition-transform duration-200 ease-out motion-reduce:transition-none ${settledOpen ? 'rotate-90' : ''}`}
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <AnimatePresence initial={false}>
              {settledOpen && (
                <motion.div
                  key="settled"
                  className="overflow-hidden"
                  {...arrive}
                >
                  <SettledList
                    key={read}
                    listed={settled}
                    open={
                      from && {
                        connectionId: from.connectionId,
                        id: from.sessionId,
                      }
                    }
                    at={at}
                    onUnsettle={onUnsettle}
                    onMove={onMove}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </>
      </div>
    </MotionConfig>
  );
}

const cursorRing = 'data-cursor:ring-2 data-cursor:ring-inset';

/**
 * Open project, at the top on a wide screen, as a row: it opens the
 * Project Picker as its keys do, and shows them. A phone has the plus at
 * the sidebar's foot instead.
 */
function OpenProject() {
  const available = keys.useAvailableActions();
  const quick = useBound('app.projects');
  const anywhere = useBound('app.projectsAnywhere');
  // `o` is Vim Mode's; out of it, the one that works anywhere opens it.
  const action =
    available.find(({ id }) => id === 'app.projects') ??
    available.find(({ id }) => id === 'app.projectsAnywhere');
  const bound = action?.id === 'app.projects' ? quick : anywhere;
  return (
    <SidebarMenu className="mb-3 max-md:hidden">
      <SidebarMenuItem>
        <SidebarMenuButton
          disabled={action === undefined}
          onClick={() => action?.run()}
          className="h-9 gap-2.5 rounded-lg px-3 text-sm font-medium text-sidebar-foreground/90 hover:bg-sidebar-accent/50"
        >
          <FolderPlusIcon
            aria-hidden
            className="size-4! text-muted-foreground"
          />
          <span className="flex-1">Open project</span>
          {bound !== null && (
            <span className="text-xs font-normal text-muted-foreground/70">
              {bound}
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * A Connection's name over its Projects, said once: small, uppercase and
 * quieter than their headings, a dot for whether it is linked, green or
 * grey, and, once it is out of reach, when it was last seen at the right.
 * A click, or Enter on it, collapses its Projects under it, the name dimmer
 * still, hovered too, and saying how many, and opens them again; a finger's height to
 * hit. Room above it sets each Connection apart.
 */
function ConnectionLabel({
  connectionId,
  name,
  first,
  collapsed,
  count,
  at,
  onToggle,
}: {
  readonly connectionId: string;
  readonly name: string;
  readonly first: boolean;
  readonly collapsed: boolean;
  /** How many Projects it has listed, as `countOf` says it. */
  readonly count: string;
  readonly at: (place: string) => true | undefined;
  readonly onToggle: () => void;
}) {
  const place = connectionPlace(connectionId);
  const health = useHealth(connectionId);
  const seen = outOfReach(health) ? `seen ${ago(health.lastSeen)}` : null;
  return (
    <ArriveItem className={first ? undefined : 'mt-4'}>
      <SidebarMenuButton
        data-place={place}
        data-cursor={at(place)}
        aria-expanded={!collapsed}
        onClick={onToggle}
        className={`h-10 gap-2 rounded-lg px-3 text-[11px] font-medium tracking-[0.06em] uppercase hover:bg-transparent active:bg-sidebar-accent/60 keyboard:md:h-7 keyboard:md:text-[10.5px] ${collapsed ? 'text-muted-foreground/45 hover:text-muted-foreground/75 active:text-muted-foreground/75' : 'text-muted-foreground/75 hover:text-sidebar-foreground active:text-sidebar-foreground'} ${cursorRing}`}
      >
        <span
          aria-hidden
          className={`size-1.5 shrink-0 rounded-full ${health._tag === 'Linked' ? 'bg-positive' : 'bg-muted-foreground/45'} ${collapsed ? 'opacity-60' : ''}`}
        />
        <span className="min-w-0 truncate">
          {name}
          {collapsed && (
            <span className="font-normal tracking-normal normal-case">
              {` (${count})`}
            </span>
          )}
        </span>
        <ChevronRightIcon
          aria-hidden
          className={`size-3! shrink-0 opacity-70 transition-transform duration-200 ease-out motion-reduce:transition-none ${collapsed ? '' : 'rotate-90'}`}
        />
        {seen !== null && (
          <span
            title="Not answering: what it last synced is shown"
            className="ml-auto shrink-0 font-normal tracking-normal normal-case"
          >
            {seen}
          </span>
        )}
      </SidebarMenuButton>
    </ArriveItem>
  );
}

/**
 * A Project's heading over its Sessions: its name, and the branch its
 * folder is on as quiet mono text, and a plus at the right. Anywhere on it
 * opens its new session, so the plus is only its sign; a finger's height
 * to hit. Of a Connection out of reach it is quieter, with no plus.
 */
function ProjectHeading({
  group: { place, connectionId, projectId, name, branch },
  first,
  open,
  quiet,
  at,
}: {
  readonly group: Group;
  readonly first: boolean;
  /** Whether its new session is open. */
  readonly open: boolean;
  /** Whether its Connection is out of reach. */
  readonly quiet: boolean;
  readonly at: (place: string) => true | undefined;
}) {
  const project = name ?? 'Unknown project';
  return (
    <ArriveItem className={first ? undefined : 'mt-2'}>
      <SidebarMenuButton
        data-place={place}
        data-cursor={at(place)}
        isActive={open}
        className={`group/heading h-11 gap-2 rounded-lg px-3 text-[13px] hover:bg-sidebar-accent/50 keyboard:md:h-7 keyboard:md:text-xs ${TOUCH_ROW} ${cursorRing}`}
        render={
          <Router.Link
            to={routes.project(connectionId, projectId)}
            title={`New session in ${project}`}
          />
        }
      >
        <span
          className={`min-w-0 shrink truncate font-semibold ${quiet ? 'text-muted-foreground' : 'text-sidebar-foreground'}`}
        >
          {project}
        </span>
        <span
          title={branch === null ? undefined : `Its folder is on ${branch}`}
          className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground/70 keyboard:md:text-[11px]"
        >
          {branch}
        </span>
        {!quiet && (
          <PlusIcon
            role="img"
            aria-label="New session"
            className="size-4! shrink-0 text-muted-foreground/60 group-hover/heading:text-sidebar-foreground keyboard:md:size-3.5!"
          />
        )}
      </SidebarMenuButton>
    </ArriveItem>
  );
}

/**
 * A Session's row hangs from its Project's guide line: a thin line down
 * the left of each row in turn, with no gap between them, so they read as
 * one line.
 */
const GUIDE =
  'py-px pl-5 before:absolute before:inset-y-0 before:left-[13px] before:w-px before:bg-sidebar-border';

/**
 * One Session, on one line: its title, its own branch when it has one, its
 * status at the right. The title wins: the branch, capped small, gives way
 * first, down to its mark alone, and the status never.
 */
function SessionRow({
  entry: { place, session },
  heading,
  quiet,
  here,
  at,
  titles,
  isUnseen,
  isAsking,
  onMove,
}: {
  readonly entry: Entry;
  /** The branch its Project's heading says. */
  readonly heading: string | null;
  /** Whether its Connection is out of reach. */
  readonly quiet: boolean;
  readonly here: Extract<Route, { readonly _tag: 'Project' }> | null;
  readonly at: (place: string) => true | undefined;
  /** Every Session's title, by `keyOf`, to name what a Fork came from. */
  readonly titles: ReadonlyMap<string, string>;
  readonly isUnseen: (session: OnConnection<Session>) => boolean;
  /** Whether its agent waits on an Agent Question. */
  readonly isAsking: (session: OnConnection<Session>) => boolean;
  readonly onMove: (session: OnConnection<Session>, settled: boolean) => void;
}) {
  const original =
    session.forkedFrom === null
      ? null
      : titles.get(
          keyOf({
            connectionId: session.connectionId,
            id: session.forkedFrom.sessionId,
          }),
        ) || 'Untitled session';
  const title = session.title || 'Untitled session';
  const branch = branchOf(session, heading);
  const unseen = isUnseen(session);
  return (
    <ArriveItem className={GUIDE}>
      <SwipeToMove
        connectionId={session.connectionId}
        sessionId={session.id}
        settled={false}
        onMove={(settled) => onMove(session, settled)}
      >
        <SidebarMenuButton
          data-place={place}
          data-cursor={at(place)}
          isActive={
            here?.connectionId === session.connectionId &&
            here.page?.sessionId === session.id
          }
          className={`h-auto min-h-12 gap-2 rounded-xl px-2.5 py-2 data-active:font-normal keyboard:md:h-auto keyboard:md:min-h-8 keyboard:md:rounded-lg keyboard:md:py-[5px] ${HOVER_ROW} ${TOUCH_ROW} ${cursorRing}`}
          render={
            <Router.Link
              to={routes.session(
                session.connectionId,
                session.projectId,
                session.id,
              )}
              title={
                original === null ? title : `${title}\nForked from ${original}`
              }
            />
          }
        >
          {original !== null && (
            <GitForkIcon
              role="img"
              aria-label={`Forked from ${original}`}
              className="size-3! shrink-0 text-muted-foreground/60"
            />
          )}
          <span
            className={`min-w-0 flex-auto truncate text-[15px] leading-5 keyboard:md:text-sm ${unseen ? 'font-semibold text-sidebar-foreground' : quiet ? 'text-muted-foreground' : ''}`}
          >
            {title}
          </span>
          {branch !== null && (
            <span
              title={`In its own worktree, on ${session.branch}`}
              className="flex max-w-[min(30%,11ch)] min-w-3 flex-[0_999_auto] items-center gap-1 overflow-hidden font-mono text-[12px] text-muted-foreground/70 keyboard:md:text-[11px]"
            >
              <FolderGit2Icon
                role="img"
                aria-label="Worktree"
                className="size-3! shrink-0 opacity-80"
              />
              <span className="min-w-0 truncate">{branch}</span>
            </span>
          )}
          <StatusWord
            status={session.status}
            unseen={unseen}
            asking={isAsking(session)}
            at={session.activeAt}
          />
        </SidebarMenuButton>
      </SwipeToMove>
    </ArriveItem>
  );
}

/** The Connections whose Projects never synced here, each with how far it got. */
function Waiting({
  connections,
}: {
  readonly connections: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }> | null;
}) {
  if (connections === null)
    return (
      <p
        role="status"
        className="flex items-center gap-2.5 px-2 py-2 text-sm text-muted-foreground"
      >
        <StandingDot kind="Linking" />
        Finding your Connections…
      </p>
    );
  return (
    <ul className="flex flex-col gap-1">
      {connections.map(({ id, name }) => (
        <ConnectionWaiting key={id} connectionId={id} name={name} />
      ))}
    </ul>
  );
}

/** One Connection never synced here: its name, and how far it got. */
function ConnectionWaiting({
  connectionId,
  name,
}: {
  readonly connectionId: string;
  readonly name: string;
}) {
  const health = useHealth(connectionId);
  // Linked, it is only reading its Projects.
  const [label, title] = pillOf(health) ?? [
    'Loading projects…',
    'Linked: reading its projects',
  ];
  return (
    <li
      role="status"
      title={title}
      className="flex items-baseline gap-2.5 px-2 py-2"
    >
      <span className="flex h-5 shrink-0 items-center">
        <StandingDot kind={standingOf(health, null).kind} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-sidebar-foreground">
          {name}
        </span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </span>
    </li>
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
 * longer shown, it falls back to the place open, or the first. Enter
 * clicks the row it is on, so a link moves the router as for a click, and
 * then, on a link, enters the page.
 */
function useCursor({
  stops,
  open,
  active,
}: {
  readonly stops: ReadonlyArray<Stop>;
  readonly open: string | null;
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
  const fallback = placeAt(open) ?? stops[0];
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
