import { Schema, type Effect } from 'effect';
import type { ReactNode } from 'react';
import type { BackgroundJob } from '@kestack/connect/code';
import { BotIcon, SquareTerminalIcon } from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import * as Picker from '../../../../../../../../../../../../ui/controls/picker/index.ts';
import { since } from '../../../../../../../../../../../../ui/labels/status/index.ts';
import { type Row, stateNow } from '../../../rows/index.ts';
import { Count } from '../../../../words/index.ts';
import { doingOf, stepsOf } from './subagent.tsx';

/*
 * What a session runs now, apart from its turn: its subagents that run,
 * the turn's own and those in the background, and its background
 * commands. A floating button over the transcript's top right counts them
 * while any run, and opens the Running Picker: by a click, in place under
 * it; by `r`, centred, as every Picker the keys open; by a touch, as a
 * Drawer. A subagent chosen opens whole; a command chosen offers to stop
 * it; and the last row stops everything.
 */

export const RunningItem = Schema.Struct({
  /** Its subagent's row id, or its job's id when it has no row. */
  id: Schema.String,
  kind: Schema.Literals(['agent', 'shell']),
  title: Schema.String,
  /** What a subagent is doing now. */
  doing: Schema.NullOr(Schema.String),
  /** How many steps a subagent has taken. */
  steps: Schema.NullOr(Schema.Finite),
  startedAt: Schema.NullOr(Schema.Finite),
  /** The subagent's row, to open it. */
  rowId: Schema.NullOr(Schema.String),
  /** Its Background Job, to stop it. */
  jobId: Schema.NullOr(Schema.String),
});
export type RunningItem = typeof RunningItem.Type;

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

/** Every subagent that runs, however deep it is nested. */
const runningSubagents = (
  rows: ReadonlyArray<Row>,
  running: boolean,
  jobs: ReadonlyArray<BackgroundJob>,
): ReadonlyArray<SubagentRow> =>
  rows.flatMap((row) =>
    row.kind !== 'subagent'
      ? []
      : [
          ...(stateNow(row, running, { jobs }) === 'running' ? [row] : []),
          ...runningSubagents(row.rows, running, jobs),
        ],
  );

/**
 * What runs now: each running subagent, with its job when it has one, then
 * every job no subagent row stands for, as a command or a subagent this
 * session has no row of.
 */
export const itemsOf = (
  rows: ReadonlyArray<Row>,
  jobs: ReadonlyArray<BackgroundJob>,
  running: boolean,
  folder: string | null,
): ReadonlyArray<RunningItem> => {
  const subagents = runningSubagents(rows, running, jobs);
  const jobOf = (row: SubagentRow) =>
    jobs.find((job) => job.toolCallId === row.call.id);
  const linked = new Set(
    subagents.flatMap((row) => {
      const job = jobOf(row);
      return job === undefined ? [] : [job.id];
    }),
  );
  return [
    ...subagents.map((row): RunningItem => {
      const job = jobOf(row);
      return {
        id: row.id,
        kind: 'agent',
        title: row.call.title || 'Subagent',
        doing: doingOf(row, folder),
        steps: stepsOf(row),
        startedAt: job?.startedAt ?? null,
        rowId: row.id,
        jobId: job?.id ?? null,
      };
    }),
    ...jobs
      .filter((job) => !linked.has(job.id))
      .map((job): RunningItem => ({
        id: job.id,
        kind: job.kind,
        title: job.title,
        doing: null,
        steps: null,
        startedAt: job.startedAt ?? null,
        rowId: null,
        jobId: job.id,
      })),
  ];
};

const Props = Schema.Struct({ items: Schema.Array(RunningItem) });

/** The last row: stops the turn and every job. */
export const STOP_ALL = 'stop-all';
/** A command's one action. */
export const STOP = 'stop';

const hintOf = (item: RunningItem, now: number) =>
  [
    item.steps !== null && item.steps > 0
      ? `${item.steps} ${item.steps === 1 ? 'step' : 'steps'}`
      : null,
    item.startedAt === null ? null : since(item.startedAt, now),
  ]
    .filter((each) => each !== null)
    .join(' · ');

const Running = Picker.make('RunningPicker', {
  props: Props,
  steps: {
    running: {
      placeholder: () => 'Find running work',
      empty: () => 'Nothing running by that name',
      rows: ({ props }) => {
        const now = Date.now();
        return {
          rows: props.items.map((item) => {
            const hint = hintOf(item, now);
            return {
              value: item.id,
              label: item.title,
              detail:
                item.kind === 'agent'
                  ? `${item.doing ?? 'Working'}…`
                  : 'Running',
              group: item.kind === 'agent' ? 'Subagents' : 'Commands',
              ...(hint === '' ? {} : { hint }),
              ...(item.kind === 'agent' && item.rowId === null
                ? {
                    unavailable:
                      'Started before this session was drawn: stop it from the command row',
                  }
                : {}),
            };
          }),
        };
      },
      pinned: () => [{ value: STOP_ALL, label: 'Stop everything' }],
      // A command opens what it can do; a subagent opens whole.
      next: (row, { props }) =>
        props.items.find((item) => item.id === row.value)?.kind === 'shell'
          ? { id: 'command', key: row.value }
          : null,
    },
    command: {
      placeholder: () => 'What to do',
      search: false,
      rows: ({ props, key }) => {
        const item = props.items.find((each) => each.id === key);
        return {
          rows:
            item === undefined
              ? []
              : [
                  {
                    value: STOP,
                    label: 'Stop this command',
                    detail: item.title,
                  },
                ],
        };
      },
    },
  },
});

/** What was chosen in the Running Picker: a subagent to open, a job to stop, or all of it. */
export type RunningChoice =
  | { readonly _tag: 'Open'; readonly rowId: string }
  | { readonly _tag: 'Stop'; readonly jobId: string }
  | { readonly _tag: 'StopAll' };

/** The last choice made in the Running Picker: its Step, which one, and its row. */
export const RunningChosen = Schema.Struct({
  step: Schema.String,
  key: Schema.String,
  value: Schema.String,
});
export type RunningChosen = typeof RunningChosen.Type;

/** What the last choice asks, from the items listed now; null when it is gone. */
export const choiceOf = (
  last: RunningChosen,
  items: ReadonlyArray<RunningItem>,
): RunningChoice | null => {
  if (last.value === STOP_ALL) return { _tag: 'StopAll' };
  const id = last.step === 'command' ? last.key : last.value;
  const item = items.find((each) => each.id === id);
  if (item === undefined) return null;
  if (last.step === 'command')
    return item.jobId === null ? null : { _tag: 'Stop', jobId: item.jobId };
  return item.rowId === null ? null : { _tag: 'Open', rowId: item.rowId };
};

/** The Running Picker the session page keeps while it is open. */
export const RunningPicker = {
  Live: Running.Live,
  View: Running.View,
  opening: (how: typeof Picker.How.Type) => ({
    how,
    step: { id: 'running', key: '' },
    choices: [],
  }),
  owner: (done: (last: RunningChosen | null) => Effect.Effect<void>) =>
    Running.owner({
      done: (choices) => {
        const last = choices?.at(-1);
        return done(
          last === undefined
            ? null
            : { step: last.step, key: last.key, value: last.value },
        );
      },
    }),
};

/**
 * The floating button over the transcript's top right while anything
 * runs: a spinner, then how many subagents and commands. It opens the
 * Running Picker around it.
 */
export function RunningButton({
  items,
  how,
  onOpen,
  title,
  children,
}: {
  readonly items: ReadonlyArray<RunningItem>;
  /** How the Picker is open; null while it is not. */
  readonly how: typeof Picker.How.Type | null;
  readonly onOpen: (how: typeof Picker.How.Type) => void;
  /** What its tooltip says, with the keys that open it. */
  readonly title: string;
  /** The Picker's View, while it is open. */
  readonly children: ReactNode;
}) {
  const agents = items.filter((item) => item.kind === 'agent').length;
  const shells = items.length - agents;
  const said = [
    agents > 0 && `${agents} ${agents === 1 ? 'subagent' : 'subagents'}`,
    shells > 0 && `${shells} ${shells === 1 ? 'command' : 'commands'}`,
  ]
    .filter((each) => typeof each === 'string')
    .join(' and ');
  return (
    <Picker.Frame
      how={how}
      mode="drawer"
      label="Running now"
      onOpen={onOpen}
      side="bottom"
      align="end"
      className="w-[26rem] max-w-[calc(100vw-1rem)]"
      trigger={
        <button
          type="button"
          aria-label={`${said} running`}
          title={title}
          className="focus-ring flex h-9 cursor-pointer items-center gap-2.5 rounded-full border border-border bg-card/85 px-3 text-xs text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_6px_16px_rgb(0_0_0/0.1)] backdrop-blur-md transition-[color,scale] duration-150 hover:text-foreground active:scale-[0.97] aria-expanded:text-foreground pointer-coarse:h-10 motion-reduce:transition-none dark:shadow-[0_1px_2px_rgb(0_0_0/0.2),0_6px_16px_rgb(0_0_0/0.3)]"
        >
          <Spinner aria-hidden className="size-3 shrink-0" />
          {agents > 0 && (
            <span className="flex items-center gap-1">
              <BotIcon aria-hidden className="size-3.5" />
              <Count value={agents} />
            </span>
          )}
          {shells > 0 && (
            <span className="flex items-center gap-1">
              <SquareTerminalIcon aria-hidden className="size-3.5" />
              <Count value={shells} />
            </span>
          )}
        </button>
      }
    >
      {how !== null && children}
    </Picker.Frame>
  );
}
