import { useChildren, View, type ViewProps } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import {
  createContext,
  memo,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { notify } from '../../../../../ui/controls/notice/index.ts';
import { instanceOf } from '../../machine/records/index.ts';
import type { Route } from '../../../../routes/index.ts';
import {
  chosenRead,
  readOf,
  readyOf,
  refusedKey,
  shownOf,
  SidebarLive,
} from './actor.ts';
import { type Drawn, drawnOf, keptOf } from './list/rows/drawn.ts';
import { Places } from './list/list.tsx';
import { doneOf, movedOf } from './list/moves/moves.ts';
import { useReload } from './edges/header/pull/pull.tsx';
import { sayMoved, SwipeBack } from './list/moves/swipe/swipe.tsx';
import { isUnseen } from './list/rows/unseen.ts';
import { MachineHeader } from './edges/header/header.tsx';

/*
 * The sidebar's View: its header, the Machine Filter and Reload
 * (`edges/header/`), then the Sessions of the Machine shown (`list/`). Only
 * this View draws again as the Projects and Sessions it reads change.
 * Nothing of them is drawn until all the Machines shown are read from this
 * device, then all at once; while Machines newly shown are read, the last
 * whole read stays (`list/rows/drawn.ts`). Its foot is `edges/foot/`.
 *
 * Before Layout is first drawn, `SidebarReady` draws nothing and says,
 * once, when all of this can be drawn whole.
 *
 * Its width, as the screen around it draws it: nothing until it is read;
 * dragged by its edge, drawn at once and kept once the drag rests; kept
 * from here or another tab, shown as kept. Layout draws the screen; the
 * sidebar hands it its width (`SidebarWidth`).
 */

export const SidebarView = View.make(
  SidebarLive,
  ({ model, children, send }) => {
    const route = useRouter<Route>().route;
    const projects = useChildren(children.projects);
    const sessions = useChildren(children.sessions);
    const read = readOf(model);
    const now = useMemo(
      () =>
        chosenRead(model)
          ? drawnOf(
              read,
              projects,
              sessions,
              (machineId) => model.unseen[machineId] !== undefined,
            )
          : null,
      [read.join(' '), projects, sessions, model.unseen, chosenRead(model)],
    );
    // The last whole read, drawn while Machines newly shown are read.
    const [last, setLast] = useState<Drawn | null>(null);
    if (now !== null && now !== last) setLast(now);
    const drawn = keptOf(now, last);
    const synced = drawn?.sessions ?? [];
    const shown = shownOf(model);
    useReload(() => send({ _tag: 'ReloadAsked' }));
    // A Move with nothing left to ask goes once the Session as synced agrees.
    const done = doneOf(synced, model.moving);
    useEffect(() => {
      for (const each of done) send({ _tag: 'MoveSeen', ...each });
    }, [
      done
        .map(({ machineId, sessionId, settled }) =>
          [machineId, sessionId, settled].join('/'),
        )
        .join(),
    ]);
    // A swipe is said with its Undo, for five seconds, which puts it back.
    const { told } = model;
    useEffect(() => {
      if (told === null) return;
      const { machineId, sessionId, settled, title } = told;
      sayMoved(
        title,
        settled,
        () =>
          send({
            _tag: 'MoveAsked',
            machineId,
            sessionId,
            settled: !settled,
            title: null,
          }),
        5,
      );
    }, [told?.n]);
    // A swipe its Machine refused is back where it was; this says why.
    const { refused } = model;
    useEffect(() => {
      if (refused === null) return;
      notify({
        title: refused.settled ? 'Not Settled' : 'Still Settled',
        description: refused.reason,
      });
    }, [refused?.n]);
    // The Machines shown whose Projects never synced here, each said as it
    // comes up; null while none was ever listed on this device.
    const neverSynced = new Set(drawn?.neverSynced ?? []);
    const waiting =
      model.machines === null && model.problem === null
        ? null
        : (model.machines ?? []).filter(
            ({ id }) =>
              (shown === null || id === shown) &&
              neverSynced.has(instanceOf(id)),
          );
    const header = (
      <MachineHeader
        read={drawn !== null}
        machines={model.machines ?? []}
        shown={shown}
        onChoose={(machineId) => send({ _tag: 'MachineChosen', machineId })}
        onReload={() => send({ _tag: 'ReloadAsked' })}
        sessions={synced}
        projects={drawn?.projects ?? []}
      />
    );
    // Until what this device holds is read, only the header's room.
    if (drawn === null) return header;
    return (
      <>
        {header}
        {/* A refusal brings its row swiped away back, drawn afresh. */}
        <SwipeBack
          value={(machineId, sessionId) =>
            model.refusals[refusedKey(machineId, sessionId)] ?? 0
          }
        >
          <Places
            read={drawn.key}
            route={route}
            projects={{ rows: drawn.projects, waiting }}
            sessions={movedOf(synced, model.moving)}
            isUnseen={(each) =>
              isUnseen(
                model.unseen[each.machineId] ?? {},
                each.id,
                each.endedAt,
              )
            }
            onOpenSession={(machineId, projectId, sessionId) =>
              send({ _tag: 'SessionOpened', machineId, projectId, sessionId })
            }
            onUnsettle={(machineId, sessionId) =>
              send({
                _tag: 'MoveAsked',
                machineId,
                sessionId,
                settled: false,
                title: null,
              })
            }
            onMove={({ machineId, id, title }, settled) =>
              send({
                _tag: 'MoveAsked',
                machineId,
                sessionId: id,
                settled,
                title: title || 'Untitled session',
              })
            }
          />
        </SwipeBack>
      </>
    );
  },
);

/**
 * Draws nothing: says once that the sidebar can be drawn whole, its width
 * and every Machine shown read from this device, so Layout draws it with
 * its rows, never its header first.
 */
export const SidebarReady = View.make(
  SidebarLive,
  ({ model, children, send }) => {
    const projects = useChildren(children.projects);
    const sessions = useChildren(children.sessions);
    const ready = readyOf(model, projects, sessions);
    useEffect(() => {
      if (ready && !model.ready) send({ _tag: 'Ready' });
    }, [ready, model.ready]);
    return null;
  },
);

/** Its width now, and how a drag of its edge says the next. */
export interface Width {
  readonly width: number;
  readonly onWidthChange: (width: number) => void;
}

/** What the sidebar's width is drawn into: the screen, from Layout. */
export const Sizing = createContext<(width: Width) => ReactNode>(() => null);

type Send = ViewProps<typeof SidebarLive>['send'];

export const SidebarWidth = View.make(SidebarLive, ({ model, send }) =>
  model.width === null ? null : <Sized kept={model.width} send={send} />,
);

/** Only a new width, kept or dragged, draws the screen again, never the rest of the sidebar's Model. */
const Sized = memo(function Sized({
  kept,
  send,
}: {
  readonly kept: number;
  readonly send: Send;
}) {
  const draw = use(Sizing);
  const [width, setWidth] = useState(kept);
  // Kept from here or another tab: shown as kept.
  useEffect(() => setWidth(kept), [kept]);
  const rest = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(rest.current), []);
  const onWidthChange = (next: number) => {
    setWidth(next);
    clearTimeout(rest.current);
    rest.current = setTimeout(
      () => send({ _tag: 'Resized', width: next }),
      300,
    );
  };
  return draw({ width, onWidthChange });
});
