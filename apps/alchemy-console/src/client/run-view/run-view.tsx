import { Effect, Schedule, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { View } from '@kestack/kabuki/react';
import {
  isFinished,
  Run,
  RunEvent,
  type RunError,
  RunLog,
  RunUpdate,
} from '../../shared/contracts/run/index.ts';
import { Api } from '../../shared/pages/index.ts';
import { mergeBySeq, phasesOf, resourcesOf } from './resources.ts';
import { RunBody, RunSkeleton } from './views.tsx';

/*
 * One run, followed live: what Deploy and Destroy runs are drawn with,
 * wherever they show.
 *
 * 1. Follow  a Worker follows `Runs.watch` for as long as the run is going,
 *            in every tab that shows it; a run that has ended is heard once
 *            more, then the Worker stops. A reconnect hears it all again,
 *            and each step is kept once, by its `seq`.
 * 2. Fold    the steps add up to the run's phases and its plan's resources,
 *            each where Alchemy last said it is (`resources.ts`).
 * 3. Draw    the resources ticking along, a log to open, and the outcome:
 *            the stage's URL, or what went wrong.
 */

export const RunView = Actor.define('RunView', {
  requires: [Api],
  props: Schema.Struct({ runId: Schema.String }),
  model: Schema.Struct({
    /** As last heard; null until the first word. */
    run: Schema.NullOr(Run),
    events: Schema.Array(RunEvent),
    logs: Schema.Array(RunLog),
    logOpen: Schema.Boolean,
    /** Why the run can't be watched: there is no such run. */
    missing: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Heard: { update: RunUpdate },
    Missing: { message: Schema.String },
    LogToggled: { open: Schema.Boolean },
  }),
});

export const RunViewLive = Actor.build(RunView, {
  init: () => ({
    model: { run: null, events: [], logs: [], logOpen: false, missing: null },
  }),
  // 1. Follow
  workers: {
    watch: {
      while: ({ model }) =>
        model.missing === null &&
        (model.run === null || !isFinished(model.run.status)),
      run: (self) =>
        Effect.gen(function* () {
          const api = yield* Api;
          const { props } = yield* self.get;
          yield* api
            .follow((client) => client['Runs.watch']({ runId: props.runId }))
            .pipe(
              Stream.takeUntil(
                (update) =>
                  update._tag === 'Run' && isFinished(update.run.status),
              ),
              Stream.runForEach((update) =>
                self.send({ _tag: 'Heard', update }),
              ),
            );
        }).pipe(
          // The run refused: there is none to watch. Anything else is the
          // connection, and is tried again.
          Effect.catchIf(
            (error): error is RunError =>
              (error as { readonly _tag?: unknown })._tag === 'RunError',
            ({ message }) => self.send({ _tag: 'Missing', message }),
          ),
          Effect.retry(Schedule.spaced('2 seconds')),
          Effect.orDie,
        ),
    },
  },
  on: {
    // 2. Fold
    Heard: ({ update }, { model }) => {
      switch (update._tag) {
        case 'Run':
          return { model: { ...model, run: update.run } };
        case 'Events':
          return {
            model: {
              ...model,
              events: mergeBySeq(model.events, update.events),
            },
          };
        case 'Logs':
          return {
            model: { ...model, logs: mergeBySeq(model.logs, update.logs) },
          };
      }
    },
    Missing: ({ message }, { model }) => ({
      model: { ...model, missing: message },
    }),
    LogToggled: ({ open }, { model }) => ({
      model: { ...model, logOpen: open },
    }),
  },
});

// 3. Draw
export const RunViewView = View.make(RunViewLive, ({ model, send, root }) => (
  <div {...root}>
    {model.missing !== null ? (
      <p role="alert" className="text-sm text-muted-foreground">
        {model.missing}
      </p>
    ) : model.run === null ? (
      <RunSkeleton />
    ) : (
      <RunBody
        run={model.run}
        phases={phasesOf(model.events)}
        resources={resourcesOf(model.events)}
        lines={model.logs.flatMap(({ lines }) => lines)}
        logOpen={model.logOpen}
        onLogToggled={(open) => send({ _tag: 'LogToggled', open })}
      />
    )}
  </div>
));
