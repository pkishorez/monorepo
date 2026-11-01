import type { Project, Session } from '@kestack/connect/code';
import { Router } from '@kestack/kabuki/routing';
import { ArchiveRestoreIcon } from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuButton,
} from '@kestack/web-platform/recipes/frame';
import { useDevice } from '@kestack/web-platform/ui/input';
import { useBound } from '../../../commands.ts';
import * as routes from '../../../../../../routes/index.ts';
import type { OnConnection } from '../../../../connection/records/index.ts';
import { ArriveItem } from '../rows/arrive/arrive.tsx';
import { SwipeToMove } from '../moves/swipe/swipe.tsx';
import { AnimatePresence } from 'motion/react';

/*
 * The Settled List: every Settled Session, flat, the most recently Settled
 * first, each with its Project's name. A row opens its Session; its button
 * Un-settles it, which puts it back in the timeline. With no keyboard a row
 * swipes left to right to un-Settle instead, and its button is only heard,
 * by a screen reader, which cannot swipe it. "Settled", last in the
 * timeline, opens it under itself, and closes it again.
 */

/** The Settled Sessions, the most recently Settled first, with their Project's name. */
export const settledOf = (
  projects: ReadonlyArray<OnConnection<Project>>,
  sessions: ReadonlyArray<OnConnection<Session>>,
) => {
  const names = new Map(
    projects.map(({ connectionId, id, name }) => [
      `${connectionId}/${id}`,
      name,
    ]),
  );
  return sessions
    .filter(({ settledAt }) => settledAt !== null)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0))
    .map((session) => ({
      place: `t:${session.connectionId}/${session.id}`,
      session,
      project:
        names.get(`${session.connectionId}/${session.projectId}`) ?? null,
    }));
};

type Listed = ReturnType<typeof settledOf>[number];

/** A Settled row: shaped as the timeline's, title over project, quieter since it is done with. */
const sessionRow =
  'h-auto min-h-14 items-start gap-3 rounded-xl px-3 py-2 text-[14px] text-sidebar-foreground/60 keyboard:md:min-h-11 keyboard:md:rounded-lg keyboard:md:py-[7px] keyboard:md:text-sm data-active:font-normal data-active:text-sidebar-foreground hover:bg-sidebar-accent/50 data-active:hover:bg-sidebar-accent';
const cursorRing = 'data-cursor:ring-2 data-cursor:ring-inset';

export function SettledList({
  listed,
  open,
  at,
  onUnsettle,
  onMove,
}: {
  readonly listed: ReadonlyArray<Listed>;
  /** The Session open, if one is, by its Connection and id. */
  readonly open: { readonly connectionId: string; readonly id: string } | null;
  /** Whether the keyboard's cursor is on a place. */
  readonly at: (place: string) => true | undefined;
  readonly onUnsettle: (connectionId: string, sessionId: string) => void;
  /** A Session swiped to un-Settle it. */
  readonly onMove: (session: OnConnection<Session>, settled: boolean) => void;
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
          <SidebarMenu className="gap-0.5">
            <AnimatePresence initial={false}>
              {listed.map(({ place, session, project }) => {
                return (
                  <ArriveItem key={place} className="group/settled">
                    <SwipeToMove
                      connectionId={session.connectionId}
                      sessionId={session.id}
                      settled
                      onMove={(settled) => onMove(session, settled)}
                    >
                      <SidebarMenuButton
                        data-place={place}
                        data-cursor={at(place)}
                        isActive={
                          open?.connectionId === session.connectionId &&
                          open.id === session.id
                        }
                        className={`${sessionRow} ${cursorRing} ${keyboard ? 'pr-9' : ''}`}
                        render={
                          <Router.Link
                            to={routes.session(
                              session.connectionId,
                              session.projectId,
                              session.id,
                            )}
                            title={session.title || undefined}
                          />
                        }
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-px">
                          <span className="truncate">
                            {session.title || 'Untitled session'}
                          </span>
                          {project !== null && (
                            <span className="truncate text-xs text-muted-foreground/70">
                              {project}
                            </span>
                          )}
                        </span>
                      </SidebarMenuButton>
                    </SwipeToMove>
                    <button
                      type="button"
                      aria-label={`Un-settle ${session.title || 'Untitled session'}`}
                      title="Un-settle"
                      onClick={() =>
                        onUnsettle(session.connectionId, session.id)
                      }
                      className={
                        keyboard
                          ? 'focus-ring absolute top-2.5 right-1 grid size-6 place-items-center rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,color,background-color] duration-150 group-hover/settled:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 disabled:opacity-100 motion-reduce:transition-none md:top-[5px] [@media(hover:none)]:opacity-100'
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
