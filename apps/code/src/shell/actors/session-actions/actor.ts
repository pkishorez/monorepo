import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients, type Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { boundIn } from '../../../keys.ts';
import { session as sessionPlace } from '../../routes/index.ts';
import { everything } from '../../replica/index.ts';
import * as Picker from '../../../ui/picker/index.ts';
import { Moves } from '../../moves/index.ts';
import { forkLatest, regenerateTitle, stop } from './api.ts';

/*
 * Session Actions: what can be done to the open Session, on its own
 * Machine.
 *
 * 1. Read    the Session, followed while open, for what applies to it:
 *            Settle or Un-settle; Fork from the latest Turn; Go to the
 *            original, for a Fork; Regenerate the title; Stop the Turn,
 *            while one runs. A row with keys of its own names them, as
 *            the user bound them.
 * 2. Run     the Picker waits while the server does it, then closes, and
 *            the app, and the keyboard, go to the Fork or the original
 *            for those two; a refusal is said in the Picker, which stays.
 *            Settle and Un-settle go through `Moves`, at once, as every
 *            Settle does, and the sidebar says a refusal.
 */

const Open = Schema.Struct({
  id: Schema.String,
  projectId: Schema.String,
  running: Schema.Boolean,
  settled: Schema.Boolean,
  /** The Session it was forked from, and its title. */
  original: Schema.NullOr(
    Schema.Struct({ id: Schema.String, title: Schema.String }),
  ),
});
type Open = typeof Open.Type;

const Bindings = Schema.Record(Schema.String, Schema.Array(Schema.String));

/** The actions that go to another Session, where the keyboard goes too. */
const GOES = new Set(['fork', 'original']);

const Actions = Picker.make('SessionActions', {
  props: Schema.Struct({ session: Schema.NullOr(Open), bindings: Bindings }),
  steps: {
    action: {
      placeholder: () => 'Search actions',
      empty: () => 'No action by that name',
      rows: ({ props: { session, bindings } }) => {
        const stopKeys = boundIn(bindings, 'content.stop');
        return {
          rows:
            session === null
              ? []
              : [
                  session.settled
                    ? {
                        value: 'unsettle',
                        label: 'Un-settle',
                        detail: 'Back among the sessions in the sidebar',
                      }
                    : {
                        value: 'settle',
                        label: 'Settle',
                        detail: 'Put it away in the Settled list',
                      },
                  {
                    value: 'fork',
                    label: 'Fork from the latest turn',
                    detail: 'A new session that remembers this one so far',
                  },
                  ...(session.original === null
                    ? []
                    : [
                        {
                          value: 'original',
                          label: 'Go to the original',
                          detail: session.original.title || 'Untitled session',
                        },
                      ]),
                  { value: 'retitle', label: 'Regenerate the title' },
                  ...(session.running
                    ? [
                        {
                          value: 'stop',
                          label: 'Stop the turn',
                          ...(stopKeys === null ? {} : { hint: stopKeys }),
                        },
                      ]
                    : []),
                ],
          loading: session === null,
        };
      },
      settles: true,
    },
  },
  lands: (choices) => GOES.has(choices.at(-1)?.value ?? ''),
});

/** 1. Read: the open Session as its rows need it; null until it is found. */
const openOf = (
  sessions: ReadonlyArray<Session>,
  sessionId: string,
): Open | null => {
  const found = sessions.find(({ id }) => id === sessionId);
  if (found === undefined) return null;
  const from = found.forkedFrom?.sessionId;
  const original =
    from === undefined
      ? null
      : {
          id: from,
          title: sessions.find(({ id }) => id === from)?.title ?? '',
        };
  return {
    id: found.id,
    projectId: found.projectId,
    running: found.status === 'running',
    settled: found.settledAt !== null,
    original,
  };
};

export const SessionActions = Actor.define('SessionActions', {
  requires: [CodeClients, Moves, Navigation, Replicas],
  props: Schema.Struct({ bindings: Bindings }),
  model: Schema.Struct({
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    /** The Session it was opened for, and its Machine. */
    machineId: Schema.String,
    sessionId: Schema.String,
    session: Schema.NullOr(Open),
    /** Where the app goes as the Picker closes, after an action. */
    after: Schema.NullOr(
      Schema.Struct({ projectId: Schema.String, sessionId: Schema.String }),
    ),
  }),
  message: Schema.TaggedUnion({
    Open: {
      how: Picker.How,
      machineId: Schema.String,
      sessionId: Schema.String,
    },
    Read: { session: Schema.NullOr(Open) },
    Closed: {},
    /** Done, and where to go after, if anywhere. */
    Ran: {
      go: Schema.NullOr(
        Schema.Struct({ projectId: Schema.String, sessionId: Schema.String }),
      ),
    },
  }),
});

/** 2. Run: what an action does, ending where the app goes after, if anywhere. */
const run = (action: string, open: Open) => {
  const none = Effect.as(Effect.void, null);
  switch (action) {
    case 'fork':
      return Effect.map(forkLatest(open.id), (fork) => ({
        projectId: fork.projectId,
        sessionId: fork.id,
      }));
    case 'original':
      return open.original === null
        ? none
        : Effect.succeed({
            projectId: open.projectId,
            sessionId: open.original.id,
          });
    case 'retitle':
      return Effect.as(regenerateTitle(open.id), null);
    case 'stop':
      return Effect.as(stop(open.id), null);
    default:
      return none;
  }
};

export const SessionActionsLive = Actor.build(SessionActions, {
  init: () => ({
    model: {
      picking: null,
      opened: 0,
      machineId: '',
      sessionId: '',
      session: null,
      after: null,
    },
  }),
  children: {
    picker: {
      actor: Actions.Live,
      while: ({ model }) => model.picking !== null,
      key: ({ model }) => String(model.opened),
      input: ({ model }) => ({
        how: model.picking ?? 'keys',
        step: { id: 'action', key: '' },
        choices: [],
      }),
      props: ({ model, props }) => ({
        session: model.session,
        bindings: props.bindings,
      }),
    },
  },
  provides: (self) =>
    Layer.unwrap(
      Effect.map(Effect.context<CodeClients | Moves>(), (client) =>
        Actions.owner({
          done: () => self.send({ _tag: 'Closed' }),
          settle: (choices) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const action = choices.at(-1)?.value ?? '';
              if (model.session === null) return 'This session is not found';
              const { machineId, session } = model;
              const go =
                action === 'settle' || action === 'unsettle'
                  ? yield* Effect.flatMap(Moves, (moves) =>
                      moves.put(
                        { machineId, sessionId: session.id },
                        action === 'settle',
                      ),
                    ).pipe(Effect.as(null), Effect.provide(client))
                  : yield* CodeClients.on(machineId, run(action, session)).pipe(
                      Effect.provide(client),
                    );
              yield* self.send({ _tag: 'Ran', go });
              return null;
            }).pipe(Effect.catch((reason) => Effect.succeed(reason))),
        }),
      ),
    ),
  workers: {
    // 1. Read
    session: {
      while: ({ model }) => model.picking !== null,
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(everything([model.machineId]), ({ sessions }) =>
            self.send({
              _tag: 'Read',
              session: openOf(sessions, model.sessionId),
            }),
          ),
        ),
    },
  },
  on: {
    Open: ({ how, machineId, sessionId }, { model }) =>
      model.picking !== null
        ? {}
        : {
            model: {
              picking: how,
              opened: model.opened + 1,
              machineId,
              sessionId,
              session:
                model.machineId === machineId && model.sessionId === sessionId
                  ? model.session
                  : null,
              after: null,
            },
          },
    Read: ({ session }, { model }) => ({ model: { ...model, session } }),
    // 2. Run: done, then, as the Picker closes, gone where it leads.
    Ran: ({ go }, { model }) => ({ model: { ...model, after: go } }),
    Closed: (_, { model }) => ({
      model: { ...model, picking: null, after: null },
      ...(model.after === null
        ? {}
        : {
            command: Router.push(
              sessionPlace(
                model.machineId,
                model.after.projectId,
                model.after.sessionId,
              ),
            ),
          }),
    }),
  },
});

export const ActionsView = Actions.View;
