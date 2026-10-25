import type { Project, Session } from '@kestack/connect/code';
import { Router } from '@kestack/kabuki/routing';
import { revealInView } from '@kestack/use-keys/surfaces';
import {
  ChevronRightIcon,
  GitForkIcon,
} from '@kestack/web-platform/ui/components/lucide';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useAppShell,
} from '@kestack/web-platform/recipes/frame';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { keys, useBound } from '../../../keys.ts';
import { outOfReach } from '../../../layer/capabilities/index.ts';
import * as routes from '../../routes/index.ts';
import type { Route } from '../../routes/index.ts';
import {
  HealthDot,
  type OnMachine,
  pillOf,
  useHealth,
  useMachineName,
} from '../../machines/index.ts';
import { ago } from '../../../ui/time/index.ts';
import { StatusWord } from '../../../ui/status-word/index.ts';
import {
  type Entry,
  keyOf,
  recentOf,
  sessionBeside,
  sessionPlace,
  timelineOf,
} from './rows.ts';
import { SettledList, settledOf } from './settled-list/index.ts';
import { SwipeToMove } from './swipe/index.ts';
import { arrive, ArriveItem } from './arrive/index.ts';
import {
  AnimatePresence,
  MotionConfig,
  motion,
} from '@kestack/web-platform/ui/components/motion';

/*
 * The sidebar: every unsettled Session of every Machine, the most recently
 * active first, under the day it was last active (rows.ts). A row is its
 * title, bold while Unseen, a fork glyph for a Fork, with its Project's
 * name under it, then its Machine's while there is more than one, and its
 * status in a word at the right, level with the title (`ui/status-word`).
 * A row under a pointer is half lit, so the open one still stands out. A
 * Machine that does not answer keeps what it last synced, its rows saying
 * when it was last seen. Last of all, "Settled"
 * with how many, quieter, opens the Settled List under it, and closes it. While
 * nothing is held and some Machine's were never synced here, each such
 * Machine is listed instead, saying how far it got: downloading
 * cloudflared, opening its tunnel, connecting. Its foot, the two buttons
 * that float over it, is `foot.tsx`.
 *
 * The whole sidebar is the `sidebar` Surface, which the App View draws. A
 * cursor goes through the rows shown, "Settled" last: j and k move it,
 * g g and Shift+G go to the first and the last, and Enter opens the row
 * and goes to the page, or, on "Settled", opens or closes the list and
 * stays.
 * Escape goes back to the page. The cursor follows the place open, and
 * entering the sidebar opens it if it was shut.
 *
 * From the page, [ and ] open the Session before and after the open one in
 * the timeline, and Ctrl+[ and Ctrl+] do so from anywhere, while typing
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
  route,
  projects,
  sessions,
  isUnseen,
  onOpenSession,
  onUnsettle,
  onMove,
}: {
  readonly route: Route;
  readonly projects: {
    readonly rows: ReadonlyArray<OnMachine<Project>>;
    /** The Machines whose projects never synced on this device; null while none was ever listed. */
    readonly waiting: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
    }> | null;
  };
  /** Every Session, Settled ones too. */
  readonly sessions: ReadonlyArray<OnMachine<Session>>;
  readonly isUnseen: (session: OnMachine<Session>) => boolean;
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
  const from =
    here === null || openSession === null
      ? null
      : { machineId: here.machineId, sessionId: openSession };
  const open =
    from === null
      ? null
      : sessionPlace({ machineId: from.machineId, id: from.sessionId });
  const [settledOpen, setSettledOpen] = useState(false);
  const recent = recentOf(projects.rows, sessions);
  const settled = settledOf(projects.rows, sessions);
  const toggleSettled = () => setSettledOpen((now) => !now);
  const stops: ReadonlyArray<Stop> = [
    ...recent.map(({ place }) => ({ place, opens: true })),
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

  const before = sessionBeside(recent, from, -1);
  const after = sessionBeside(recent, from, 1);
  const go = (to: OnMachine<Session> | undefined) => {
    if (to === undefined) return;
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
  // Sessions the device holds draw at once, of every Machine; with none,
  // how far each Machine never synced here got.
  const waiting =
    recent.length === 0 &&
    projects.rows.length === 0 &&
    (projects.waiting === null || projects.waiting.length > 0);
  return (
    <MotionConfig reducedMotion="user">
      <div ref={cursor.list} className="flex flex-col px-2 pb-1">
        <>
          {waiting ? (
            <Waiting machines={projects.waiting} />
          ) : recent.length === 0 ? (
            <p className="px-3 py-2 text-[15px] text-pretty text-muted-foreground keyboard:md:text-sm">
              No sessions yet. Start one with the plus
              {picks === null ? '' : `, or ${picks}`}: pick a folder, then say
              what to do.
            </p>
          ) : (
            <div className="flex flex-col">
              <AnimatePresence initial={false}>
                {timelineOf(recent, Date.now()).map(({ day, entries }) => (
                  <motion.section key={day} aria-label={day} {...arrive}>
                    <div className="pb-4 keyboard:md:pb-3">
                      <h3 className="px-3 pb-1 text-[13px] font-medium text-muted-foreground keyboard:md:text-xs">
                        {day}
                      </h3>
                      <SidebarMenu className="gap-0">
                        <AnimatePresence initial={false}>
                          {entries.map((entry) => (
                            <SessionRow
                              key={entry.place}
                              entry={entry}
                              here={here}
                              at={at}
                              titles={titles}
                              isUnseen={isUnseen}
                              onMove={onMove}
                            />
                          ))}
                        </AnimatePresence>
                      </SidebarMenu>
                    </div>
                  </motion.section>
                ))}
              </AnimatePresence>
            </div>
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
                  className={`h-11 gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-transparent hover:text-sidebar-foreground active:bg-sidebar-accent/60 keyboard:md:h-7 keyboard:md:text-xs ${cursorRing}`}
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
                    listed={settled}
                    open={
                      from && { machineId: from.machineId, id: from.sessionId }
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

/** One Session: its title over where it is, its status at the right. */
function SessionRow({
  entry: { place, session, project },
  here,
  at,
  titles,
  isUnseen,
  onMove,
}: {
  readonly entry: Entry;
  readonly here: Extract<Route, { readonly _tag: 'Project' }> | null;
  readonly at: (place: string) => true | undefined;
  /** Every Session's title, by `keyOf`, to name what a Fork came from. */
  readonly titles: ReadonlyMap<string, string>;
  readonly isUnseen: (session: OnMachine<Session>) => boolean;
  readonly onMove: (session: OnMachine<Session>, settled: boolean) => void;
}) {
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
    <ArriveItem>
      <SwipeToMove
        machineId={session.machineId}
        sessionId={session.id}
        settled={false}
        onMove={(settled) => onMove(session, settled)}
      >
        <SidebarMenuButton
          data-place={place}
          data-cursor={at(place)}
          isActive={
            here?.machineId === session.machineId &&
            here.page?.sessionId === session.id
          }
          className={`h-auto min-h-14 items-start gap-3 rounded-xl px-3 py-2 data-active:font-normal keyboard:md:h-auto keyboard:md:min-h-10 keyboard:md:rounded-lg keyboard:md:py-1 ${HOVER_ROW} ${TOUCH_ROW} ${cursorRing}`}
          render={
            <Router.Link
              to={routes.session(
                session.machineId,
                session.projectId,
                session.id,
              )}
              title={
                original === null ? title : `${title}\nForked from ${original}`
              }
            />
          }
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
              {original !== null && (
                <GitForkIcon
                  role="img"
                  aria-label={`Forked from ${original}`}
                  className="size-3.5! text-muted-foreground/70"
                />
              )}
              <span
                className={`min-w-0 truncate text-[15px] leading-5 keyboard:md:text-[13px] ${isUnseen(session) ? 'font-semibold text-sidebar-foreground' : ''}`}
              >
                {title}
              </span>
            </span>
            <Where machineId={session.machineId} project={project} />
          </span>
          <StatusWord
            status={session.status}
            unseen={isUnseen(session)}
            at={session.activeAt}
          />
        </SidebarMenuButton>
      </SwipeToMove>
    </ArriveItem>
  );
}

/**
 * Where a Session is: its Project's name, then its Machine's while there
 * is more than one, and, while the Machine does not answer, when it was
 * last seen.
 */
function Where({
  machineId,
  project,
}: {
  readonly machineId: string;
  readonly project: string | null;
}) {
  const machine = useMachineName(machineId);
  const health = useHealth(machineId);
  const seen = outOfReach(health) ? `seen ${ago(health.lastSeen)}` : null;
  const where = [project, machine, seen]
    .filter((each) => each !== null)
    .join(' · ');
  if (where === '') return null;
  return (
    <span
      className="truncate text-[13px] text-muted-foreground keyboard:md:text-xs"
      title={
        seen === null
          ? undefined
          : 'Not answering: what it last synced is shown'
      }
    >
      {where}
    </span>
  );
}

/** The Machines whose Projects never synced here, each with how far it got. */
function Waiting({
  machines,
}: {
  readonly machines: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }> | null;
}) {
  if (machines === null)
    return (
      <p
        role="status"
        className="flex items-center gap-2.5 px-2 py-2 text-sm text-muted-foreground"
      >
        <HealthDot health={{ _tag: 'Unknown' }} tone="bg-warning" />
        Finding your Machines…
      </p>
    );
  return (
    <ul className="flex flex-col gap-1">
      {machines.map(({ id, name }) => (
        <MachineWaiting key={id} machineId={id} name={name} />
      ))}
    </ul>
  );
}

/** One Machine never synced here: its name, and how far it got. */
function MachineWaiting({
  machineId,
  name,
}: {
  readonly machineId: string;
  readonly name: string;
}) {
  const health = useHealth(machineId);
  // Connected, it is only reading its Projects.
  const [label, title, tone] = pillOf(health) ?? [
    'Loading projects…',
    'Connected: reading its projects',
    'bg-positive',
  ];
  return (
    <li
      role="status"
      title={title}
      className="flex items-baseline gap-2.5 px-2 py-2"
    >
      <span className="flex h-5 shrink-0 items-center">
        <HealthDot health={health} tone={tone} />
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
