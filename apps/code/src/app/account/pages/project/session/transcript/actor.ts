import { Schema, type Effect } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Messages, SessionRow } from '../../../../connection/records/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import { since } from '../../../../../../ui/labels/status/index.ts';

/*
 * The transcript: what a session says, as this device holds it, and the
 * Running Picker over it. It reads; the session acts on what is read, and
 * keeps how the transcript is open, so its Props are the session's.
 *
 * 1. Row      the session's row, which says whether it runs, its agent
 *             and model, and whether it is held here at all.
 * 2. Messages its messages, and those of each session up its fork chain
 *             (`earlier`), one Query each, whose `where` opens that
 *             session's Window, so they sync while the page is open and
 *             the history it carries on from can be drawn before its own.
 *             A Fork is on its original's Connection.
 * 3. Running  the Running Picker, over what the session's View reads runs
 *             from its rows and jobs, while the session says it is open:
 *             a subagent or a command chosen opens, and the last row
 *             stops all. What is chosen goes to the session, which gives
 *             its owner.
 *
 * Its View hands what it reads to the session's View (`Around`), so the
 * page, the Draft beside it and the Question Panel draw from one read.
 */

// 3. Running: kept here, apart from the transcript's drawing, so the
// page's first load never carries the transcript.

/** One thing that runs, as the View reads it from rows and jobs. */
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
type RunningItem = typeof RunningItem.Type;

const Props = Schema.Struct({ items: Schema.Array(RunningItem) });

/** The last row: stops the turn and every job. */
export const STOP_ALL = 'stop-all';

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
    },
  },
});

/** What was chosen in the Running Picker: a subagent or a command to open, or all of it to stop. */
export type RunningChoice =
  | { readonly _tag: 'Open'; readonly rowId: string }
  | { readonly _tag: 'OpenCommand'; readonly jobId: string }
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
  const item = items.find((each) => each.id === last.value);
  if (item === undefined) return null;
  if (item.kind === 'shell')
    return item.jobId === null
      ? null
      : { _tag: 'OpenCommand', jobId: item.jobId };
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

const Transcript = Actor.define('Transcript', {
  props: Schema.Struct({
    connectionId: Schema.String,
    sessionId: Schema.String,
    /** The sessions it carries on from, nearest first: none for one not forked. */
    earlier: Schema.Array(Schema.String),
    /** What runs now, as the session's View read it. */
    running: Schema.Array(RunningItem),
    /** How the Running Picker is open; null while it is not. */
    picking: Schema.NullOr(Picker.How),
    /** How many times it was opened, so each opening is a fresh Picker. */
    opened: Schema.Finite,
  }),
});

export const TranscriptLive = Transcript.build({
  children: {
    // 1. Row
    session: Actor.child(SessionRow, {
      props: ({ props }) => ({
        connectionId: props.connectionId,
        sessionId: props.sessionId,
      }),
    }),
    // 2. Messages: its own first, then each up its chain.
    messages: Actor.child(Messages, {
      each: ({ props }) => [props.sessionId, ...props.earlier],
      props: ({ props }, sessionId) => ({
        connectionId: props.connectionId,
        sessionId,
      }),
    }),
    // 3. Running
    running: Actor.child(RunningPicker.Live, {
      while: ({ props }) => props.picking !== null,
      key: ({ props }) => String(props.opened),
      input: ({ props }) => RunningPicker.opening(props.picking ?? 'keys'),
      props: ({ props }) => ({ items: props.running }),
    }),
  },
});
