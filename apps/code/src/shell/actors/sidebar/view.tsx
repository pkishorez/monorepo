import { useChildren, View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { useEffect } from 'react';
import { notify } from '../../../ui/toast/index.ts';
import { instanceOf } from '../../machines/index.ts';
import type { Route } from '../../routes/index.ts';
import { refusedKey, shownOf, SidebarLive } from './actor.ts';
import { Places } from './sidebar.tsx';
import { doneOf, movedOf } from './moves.ts';
import { useReload } from './pull/index.ts';
import { sayMoved, SwipeBack } from './swipe/index.ts';
import { isUnseen } from './unseen.ts';
import { MachineHeader } from './machine-header/index.ts';

/*
 * The sidebar's View: its header, the Machine Filter and Reload
 * (`machine-header/`), then the Sessions of the Machine shown
 * (`sidebar.tsx`). Only this View draws
 * again as the Projects and Sessions it reads change.
 */

export const SidebarView = View.make(
  SidebarLive,
  ({ model, children, send }) => {
    const route = useRouter<Route>().route;
    const [projects] = useChildren(children.projects, ({ model }) => model);
    const [found] = useChildren(children.sessions, ({ model }) => model);
    const synced = (found?.rows ?? []).map(({ row }) => row);
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
    const neverSynced = new Set(projects?.neverSynced ?? []);
    const waiting =
      model.machines === null && model.problem === null
        ? null
        : (model.machines ?? []).filter(
            ({ id }) =>
              (shown === null || id === shown) &&
              neverSynced.has(instanceOf(id)),
          );
    return (
      <>
        <MachineHeader
          machines={model.machines ?? []}
          shown={shown}
          onChoose={(machineId) => send({ _tag: 'MachineChosen', machineId })}
          onReload={() => send({ _tag: 'ReloadAsked' })}
          sessions={synced}
          projects={(projects?.rows ?? []).map(({ row }) => row)}
        />
        {/* A refusal brings its row swiped away back, drawn afresh. */}
        <SwipeBack
          value={(machineId, sessionId) =>
            model.refusals[refusedKey(machineId, sessionId)] ?? 0
          }
        >
          <Places
            route={route}
            projects={{
              rows: (projects?.rows ?? []).map(({ row }) => row),
              waiting,
            }}
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
