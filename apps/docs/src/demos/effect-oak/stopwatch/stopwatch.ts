import { Schema } from 'effect';
import { Actor } from 'effect-oak';

/*
 * A stopwatch, as two States. Stopped keeps the time so far; Running keeps
 * the time before it started and the Time it started at. How long it has
 * run at any moment follows from that (`elapsedAt`), so nothing ticks: the
 * View works the running time out at each Frame.
 */

export const Stopwatch = Actor.make('Stopwatch', {
  state: Schema.TaggedUnion({
    Stopped: { elapsed: Schema.Number },
    Running: { before: Schema.Number, since: Schema.Number },
  }),
  message: Schema.TaggedUnion({
    ClickedStart: {},
    ClickedStop: {},
    ClickedReset: {},
  }),
}).build({
  init: () => ({ state: { _tag: 'Stopped', elapsed: 0 } }),
  update: {
    Stopped: {
      ClickedStart: (_, { state, at }) => ({
        state: { _tag: 'Running', before: state.elapsed, since: at },
      }),
    },
    Running: {
      ClickedStop: (_, { state, at }) => ({
        state: { _tag: 'Stopped', elapsed: elapsedAt(state, at) },
      }),
    },
    '*': {
      ClickedReset: () => ({ state: { _tag: 'Stopped', elapsed: 0 } }),
    },
  },
});

/** How long a running stopwatch has run by Time `at`, in milliseconds. */
export const elapsedAt = (
  running: { readonly before: number; readonly since: number },
  at: number,
) => running.before + (at - running.since);
