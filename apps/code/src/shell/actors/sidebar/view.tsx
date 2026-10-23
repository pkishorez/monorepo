import { useChildren, View } from '@kestack/kabuki/react';
import { useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import { RefreshCwIcon } from '@kestack/web-platform/components/lucide';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kestack/web-platform/components/select';
import { createContext, type ReactNode, use } from 'react';
import { placeOf, type Route } from '../../places/index.ts';
import { shownOf, SidebarLive } from './actor.ts';
import { Places } from './sidebar.tsx';
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
    const shown = shownOf(model);
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
          sessions={(found?.rows ?? []).map(({ row }) => row)}
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
        <span className="min-w-0 flex-1 truncate px-2 text-sm">
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
            className="min-w-0 flex-1 border-none shadow-none"
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
      >
        <RefreshCwIcon />
      </Button>
    </div>
  );
}
