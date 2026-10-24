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
import { createContext, type ReactNode, use, useEffect } from 'react';
import { notify } from '../../../ui/toast/index.ts';
import { placeOf, type Route } from '../../places/index.ts';
import { shownOf, SidebarLive } from './actor.ts';
import { Places } from './sidebar.tsx';
import { movedOf, seenOf } from './moves.ts';
import { useReload } from './pull/index.ts';
import { moveWithUndo } from './swipe/index.ts';
import { isUnseen } from './unseen.ts';

/*
 * The sidebar's View: the Machine Filter and Reload at its top, then the
 * Projects and Sessions of the Machine shown (`sidebar.tsx`). The Project
 * Picker's plus is the root's, handed in through `Slots`. Only this View
 * draws again as the Projects and Sessions it reads change.
 */

/** What the root hands the sidebar to draw in it. */
export const Slots = createContext<{ readonly projectPicker: ReactNode }>({
  projectPicker: null,
});

/** The value the Machine Filter gives every Machine. */
const EVERY = 'every';

export const SidebarView = View.make(
  SidebarLive,
  ({ model, children, send }) => {
    const route = placeOf(useRouter<Route>().route);
    const { projectPicker } = use(Slots);
    const [projects] = useChildren(children.projects, ({ model }) => model);
    const [found] = useChildren(children.sessions, ({ model }) => model);
    const synced = (found?.rows ?? []).map(({ row }) => row);
    const shown = shownOf(model);
    useReload(() => send({ _tag: 'ReloadAsked' }));
    // A Move is dropped once the Session as synced agrees with it.
    const seen = seenOf(synced, model.moving);
    useEffect(() => {
      for (const { machineId, sessionId } of seen)
        send({ _tag: 'MoveSeen', machineId, sessionId });
    }, [seen.map(({ n }) => n).join()]);
    // A swipe its Machine refused is back where it was; this says why.
    const { refused } = model;
    useEffect(() => {
      if (refused === null) return;
      notify({
        title: refused.settled ? 'Not Settled' : 'Still Settled',
        description: refused.reason,
      });
    }, [refused?.n]);
    // Never listed on this device yet: a skeleton meanwhile.
    const neverListed = model.machines === null && model.problem === null;
    return (
      <>
        <MachineFilter
          machines={model.machines ?? []}
          shown={shown}
          onChoose={(machineId) => send({ _tag: 'MachineChosen', machineId })}
          onReload={() => send({ _tag: 'ReloadAsked' })}
        />
        <Places
          route={route}
          projects={{
            rows: (projects?.rows ?? []).map(({ row }) => row),
            loading: neverListed || (projects?.neverSynced.length ?? 0) > 0,
          }}
          sessions={movedOf(synced, model.moving)}
          isUnseen={(each) =>
            isUnseen(model.unseen[each.machineId] ?? {}, each.id, each.endedAt)
          }
          unsettling={model.unsettling}
          projectPicker={projectPicker}
          onOpenSession={(machineId, projectId, sessionId) =>
            send({ _tag: 'SessionOpened', machineId, projectId, sessionId })
          }
          onUnsettle={(machineId, sessionId) =>
            send({ _tag: 'UnsettleAsked', machineId, sessionId })
          }
          onMove={({ machineId, id, title }, settled) =>
            moveWithUndo(title || 'Untitled session', settled, (to) =>
              send({
                _tag: 'MoveAsked',
                machineId,
                sessionId: id,
                settled: to,
              }),
            )
          }
        />
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
