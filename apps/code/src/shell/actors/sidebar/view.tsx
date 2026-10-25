import { useChildren, View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { RefreshCwIcon } from '@kestack/web-platform/ui/components/lucide';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kestack/web-platform/ui/components/select';
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

/*
 * The sidebar's View: the Machine Filter and Reload at its top, then the
 * Sessions of the Machine shown (`sidebar.tsx`). Only this View draws
 * again as the Projects and Sessions it reads change.
 */

/** The value the Machine Filter gives every Machine. */
const EVERY = 'every';

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
        <MachineFilter
          machines={model.machines ?? []}
          shown={shown}
          onChoose={(machineId) => send({ _tag: 'MachineChosen', machineId })}
          onReload={() => send({ _tag: 'ReloadAsked' })}
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

/**
 * Which Machine the sidebar shows, every Machine first, and Reload. With
 * one Machine there is nothing to choose: only its name shows.
 */
function MachineFilter({
  machines,
  shown,
  onChoose,
  onReload,
}: {
  readonly machines: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly shown: string | null;
  readonly onChoose: (machineId: string | null) => void;
  readonly onReload: () => void;
}) {
  const [only, ...others] = machines;
  return (
    <div className="flex items-center gap-1 px-2 pb-1">
      {only === undefined ? (
        <span className="min-w-0 flex-1 px-2 text-sm text-muted-foreground">
          No Machines
        </span>
      ) : others.length === 0 ? (
        <span className="min-w-0 flex-1 truncate px-2 text-sm max-md:text-base max-md:font-semibold">
          {only.name}
        </span>
      ) : (
        <Select
          value={shown ?? EVERY}
          onValueChange={(value) => onChoose(value === EVERY ? null : value)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Machine"
            className="min-w-0 flex-1 border-none shadow-none data-[size=sm]:h-11 keyboard:md:data-[size=sm]:h-8 max-md:text-base max-md:font-semibold"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EVERY}>All Machines</SelectItem>
            {machines.map(({ id, name }) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Reload the Machines"
        title="Reload the Machines"
        onClick={onReload}
        className="size-11 keyboard:md:size-8 max-md:-mr-1 max-md:rounded-full max-md:text-muted-foreground"
      >
        <RefreshCwIcon />
      </Button>
    </div>
  );
}
