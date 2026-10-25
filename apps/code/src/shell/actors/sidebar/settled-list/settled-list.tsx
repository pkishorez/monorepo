import type { Project, Session } from '@kestack/connect/code';
import { Router } from '@kestack/kabuki/routing';
import { ArchiveRestoreIcon } from '@kestack/web-platform/ui/components/lucide';
import {
  SidebarMenu,
  SidebarMenuButton,
} from '@kestack/web-platform/recipes/frame';
import { useDevice } from '@kestack/web-platform/ui/input';
import { useBound } from '../../../../keys.ts';
import * as routes from '../../../routes/index.ts';
import type { OnMachine } from '../../../machines/index.ts';
import { ArriveItem } from '../arrive/index.ts';
import { SwipeToMove } from '../swipe/index.ts';
import { AnimatePresence } from '@kestack/web-platform/ui/components/motion';

/*
 * The Settled List: every Settled Session, flat, the most recently Settled
 * first, each with its Project's name. A row opens its Session; its button
 * Un-settles it, which puts it back in the timeline. With no keyboard a row
 * swipes right to left to un-Settle instead, and its button is only heard,
 * by a screen reader, which cannot swipe it. "Settled", last in the
 * timeline, opens it under itself, and closes it again.
 */

/** The Settled Sessions, the most recently Settled first, with their Project's name. */
export const settledOf = (
  projects: ReadonlyArray<OnMachine<Project>>,
  sessions: ReadonlyArray<OnMachine<Session>>,
) => {
  const names = new Map(
    projects.map(({ machineId, id, name }) => [`${machineId}/${id}`, name]),
  );
  return sessions
    .filter(({ settledAt }) => settledAt !== null)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .map((session) => ({
      place: `t:${session.machineId}/${session.id}`,
      session,
      project: names.get(`${session.machineId}/${session.projectId}`) ?? null,
    }));
};

type Listed = ReturnType<typeof settledOf>[number];

/** A Settled row: done with, so quieter and shorter than the timeline's, still a finger's to hit. */
const sessionRow =
  'h-11 gap-3 rounded-lg px-3 py-0 text-[14px] text-sidebar-foreground/75 keyboard:md:h-7 keyboard:md:text-[13px] data-active:font-normal data-active:text-sidebar-foreground';
const cursorRing = 'data-cursor:ring-2 data-cursor:ring-inset';

export function SettledList({
  listed,
  open,
  at,
  onUnsettle,
  onMove,
}: {
  readonly listed: ReadonlyArray<Listed>;
  /** The Session open, if one is, by its Machine and id. */
  readonly open: { readonly machineId: string; readonly id: string } | null;
  /** Whether the keyboard's cursor is on a place. */
  readonly at: (place: string) => true | undefined;
  readonly onUnsettle: (machineId: string, sessionId: string) => void;
  /** A Session swiped to un-Settle it. */
  readonly onMove: (session: OnMachine<Session>, settled: boolean) => void;
}) {
  const settle = useBound('app.actions');
  // With no keyboard a row swipes to un-Settle; its button is only heard.
  const { keyboard } = useDevice();
  return (
    <div className="flex flex-col">
      <div>
        {listed.length === 0 ? (
          <p className="px-3 py-1.5 text-[13px] text-pretty text-muted-foreground keyboard:md:text-xs">
            {!keyboard
              ? 'Nothing is Settled. Swipe a session you are done with left to right to Settle it.'
              : `Nothing is Settled. Settle a session you are done with from Session Actions${settle === null ? '' : ` (${settle})`}.`}
          </p>
        ) : (
          <SidebarMenu className="gap-0">
            <AnimatePresence initial={false}>
              {listed.map(({ place, session, project }) => {
                return (
                  <ArriveItem key={place} className="group/settled">
                    <SwipeToMove
                      machineId={session.machineId}
                      sessionId={session.id}
                      settled
                      onMove={(settled) => onMove(session, settled)}
                    >
                      <SidebarMenuButton
                        data-place={place}
                        data-cursor={at(place)}
                        isActive={
                          open?.machineId === session.machineId &&
                          open.id === session.id
                        }
                        className={`${sessionRow} ${cursorRing} ${keyboard ? 'pr-9' : ''}`}
                        render={
                          <Router.Link
                            to={routes.session(
                              session.machineId,
                              session.projectId,
                              session.id,
                            )}
                            title={session.title || undefined}
                          />
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {session.title || 'Untitled session'}
                        </span>
                        {project !== null && (
                          <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                            {project}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SwipeToMove>
                    <button
                      type="button"
                      aria-label={`Un-settle ${session.title || 'Untitled session'}`}
                      title="Un-settle"
                      onClick={() => onUnsettle(session.machineId, session.id)}
                      className={
                        keyboard
                          ? 'focus-ring absolute top-2.5 right-1 grid size-6 place-items-center rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,color,background-color] duration-150 group-hover/settled:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 disabled:opacity-100 motion-reduce:transition-none md:top-0.5 [@media(hover:none)]:opacity-100'
                          : 'sr-only'
                      }
                    >
                      <ArchiveRestoreIcon aria-hidden className="size-3.5" />
                    </button>
                  </ArriveItem>
                );
              })}
            </AnimatePresence>
          </SidebarMenu>
        )}
      </div>
    </div>
  );
}
