import type { Project, Session } from '@kestack/connect/code';
import { Drawer } from '@kestack/web-platform/recipes/touch-layers';
import {
  CheckIcon,
  ChevronDownIcon,
  RefreshCwIcon,
} from '@kestack/web-platform/ui/components/lucide';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { type ReactNode, useState } from 'react';
import {
  type OnMachine,
  pillOf,
  useHealths,
  useMachines,
} from '../../../machines/index.ts';
import { ago } from '../../../../ui/time/index.ts';

/*
 * The sidebar's top, which stays put as the timeline scrolls under it: the
 * app's mark, then whose sessions it shows, the Machine Filter, as a title,
 * with how that Machine stands under it, or how many Machines and sessions
 * there are when it shows every Machine; and Reload, which turns once as
 * it asks. With more than one Machine the title opens the Machines, a
 * Drawer of every Machine and All Machines: each with its state, its
 * sessions (how many run) and projects, its tunnel and the version of
 * Connect it runs, the one shown checked.
 */

type Kind = 'Connected' | 'Down' | 'Connecting';

interface Info {
  readonly id: string;
  readonly name: string;
  readonly kind: Kind;
  /** How it stands, in a few words. */
  readonly state: string;
  readonly sessions: number;
  readonly running: number;
  readonly projects: number;
  readonly about: string | null;
}

type Counts = Pick<Info, 'sessions' | 'running' | 'projects'>;

const TUNNEL: Record<string, string> = {
  Reachable: 'Tunnel reachable',
  Unreachable: 'Tunnel unreachable',
  Unchecked: 'Tunnel up, not checked yet',
  Opening: 'Opening its tunnel',
  Installing: 'Installing cloudflared',
  OpenFailed: 'Tunnel failed to open',
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Sessions, how many run, and projects, as one line. */
const countsOf = ({ sessions, running, projects }: Counts) =>
  [
    plural(sessions, 'session'),
    running > 0 ? `${running} running` : null,
    plural(projects, 'project'),
  ]
    .filter((each) => each !== null)
    .join(' · ');

/** Each Machine as the header and its Drawer say it. */
function useInfos(
  machines: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  sessions: ReadonlyArray<OnMachine<Session>>,
  projects: ReadonlyArray<OnMachine<Project>>,
): ReadonlyArray<Info> {
  const listed = useMachines();
  const healthOf = useHealths();
  return machines.map(({ id, name }) => {
    const health = healthOf(id);
    const record = listed.find((each) => each.id === id);
    const own = sessions.filter(
      (each) => each.machineId === id && each.settledAt === null,
    );
    return {
      id,
      name,
      kind:
        health._tag === 'Connected'
          ? 'Connected'
          : health._tag === 'Down'
            ? 'Down'
            : 'Connecting',
      state:
        pillOf(health)?.[0] ??
        (record === undefined
          ? 'Connected'
          : `Connected · seen ${ago(record.lastSeen)}`),
      sessions: own.length,
      running: own.filter(({ status }) => status === 'running').length,
      projects: projects.filter(({ machineId }) => machineId === id).length,
      about:
        [
          record === undefined ? null : (TUNNEL[record.status._tag] ?? null),
          record?.version ? `Connect ${record.version}` : null,
        ]
          .filter((each) => each !== null)
          .join(' · ') || null,
    };
  });
}

function Dot({ kind }: { readonly kind: Kind }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2 shrink-0 rounded-full',
        kind === 'Connected'
          ? 'bg-positive'
          : kind === 'Down'
            ? 'bg-destructive'
            : 'animate-pulse bg-warning motion-reduce:animate-none',
      )}
    />
  );
}

/** The app's mark: a prompt in a rounded square, in the theme's ink. */
function Mark() {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-foreground text-background md:size-8 md:rounded-lg"
    >
      <svg viewBox="0 0 20 20" className="size-6 md:size-5">
        <path
          d="M6 7l3 3-3 3M10.5 13.5H14"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </span>
  );
}

export function MachineHeader({
  machines,
  shown,
  sessions,
  projects,
  onChoose,
  onReload,
}: {
  readonly machines: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  /** The Machine shown, or null for every one. */
  readonly shown: string | null;
  /** Every Session held, and every Project, to count each Machine's. */
  readonly sessions: ReadonlyArray<OnMachine<Session>>;
  readonly projects: ReadonlyArray<OnMachine<Project>>;
  readonly onChoose: (machineId: string | null) => void;
  readonly onReload: () => void;
}) {
  const infos = useInfos(machines, sessions, projects);
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState(0);
  const many = infos.length > 1;
  const chosen =
    infos.length === 1
      ? infos[0]!
      : (infos.find(({ id }) => id === shown) ?? null);
  const all: Counts = {
    sessions: infos.reduce((n, each) => n + each.sessions, 0),
    running: infos.reduce((n, each) => n + each.running, 0),
    projects: infos.reduce((n, each) => n + each.projects, 0),
  };
  const pick = (machineId: string | null) => {
    onChoose(machineId);
    setOpen(false);
  };

  const title = (
    <>
      <Mark />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="flex max-w-full min-w-0 items-center gap-1.5">
          <span className="truncate text-[22px] leading-tight font-semibold tracking-tight md:text-base">
            {infos.length === 0
              ? 'No Machines'
              : (chosen?.name ?? 'All Machines')}
          </span>
          {many && (
            <ChevronDownIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}
        </span>
        <span className="flex max-w-full items-center gap-1.5 text-[13px] text-muted-foreground md:text-xs">
          {chosen !== null ? (
            <>
              <Dot kind={chosen.kind} />
              <span className="truncate">{chosen.state}</span>
            </>
          ) : many ? (
            <span className="truncate">
              {plural(infos.length, 'Machine')} ·{' '}
              {plural(all.sessions, 'session')}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-sidebar px-4 pt-1 pb-4 md:px-3 md:pb-3">
      {many ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Choose whose sessions to show"
          onClick={() => setOpen(true)}
          className="focus-ring -m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-sidebar-accent/60 motion-reduce:transition-none"
        >
          {title}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{title}</div>
      )}
      <button
        type="button"
        aria-label="Reload the Machines"
        title="Reload the Machines"
        onClick={() => {
          onReload();
          setTurns((n) => n + 1);
        }}
        className="focus-ring -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-[background-color,transform] duration-150 hover:bg-sidebar-accent active:scale-90 motion-reduce:transition-none md:size-8"
      >
        <RefreshCwIcon
          aria-hidden
          style={{ transform: `rotate(${turns * 360}deg)` }}
          className="size-[18px] transition-transform duration-700 ease-out motion-reduce:transition-none md:size-4"
        />
      </button>
      <Drawer
        open={open}
        onOpenChange={(next) => setOpen(next)}
        label="Machines"
      >
        <div className="flex flex-col gap-2 px-4 pt-1 pb-4">
          <h2 className="px-1 pb-1 text-[17px] font-semibold">Machines</h2>
          <div
            role="radiogroup"
            aria-label="Machine"
            className="flex flex-col divide-y divide-border/70 border-y border-border/70"
          >
            <Choice
              name="All Machines"
              lines={[countsOf(all)]}
              mark={
                <span
                  aria-hidden
                  className="size-2 rounded-full ring-[1.5px] ring-muted-foreground/60 ring-inset"
                />
              }
              selected={shown === null}
              onPick={() => pick(null)}
            />
            {infos.map((info) => (
              <Choice
                key={info.id}
                name={info.name}
                lines={[info.state, countsOf(info), info.about]}
                mark={<Dot kind={info.kind} />}
                selected={shown === info.id}
                onPick={() => pick(info.id)}
              />
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}

/** One choice in the Machines: its name over what it is, checked when shown. */
function Choice({
  name,
  lines,
  mark,
  selected,
  onPick,
}: {
  readonly name: string;
  readonly lines: ReadonlyArray<string | null>;
  readonly mark: ReactNode;
  readonly selected: boolean;
  readonly onPick: () => void;
}) {
  const [first, ...rest] = lines.filter((each) => each !== null);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="focus-ring flex min-h-16 w-full items-start gap-3 px-1 py-3 text-left transition-[background-color,transform] duration-150 active:scale-[0.99] active:bg-muted/60 motion-reduce:transition-none"
    >
      <span className="flex h-6 w-3 shrink-0 items-center justify-center">
        {mark}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[17px] font-semibold">{name}</span>
        {first !== undefined && (
          <span className="truncate text-[13px] text-muted-foreground">
            {first}
          </span>
        )}
        {rest.map((line) => (
          <span
            key={line}
            className="truncate text-xs text-muted-foreground/80"
          >
            {line}
          </span>
        ))}
      </span>
      {selected && (
        <CheckIcon aria-label="Shown" className="mt-1 size-5 shrink-0" />
      )}
    </button>
  );
}
