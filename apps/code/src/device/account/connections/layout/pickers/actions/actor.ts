import { Effect, Layer, Schema, Stream } from 'effect';
import { CodeClients, type Session } from '@kestack/connect/code';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { boundIn } from '../../commands.ts';
import { session as sessionPlace } from '../../../../../routes/index.ts';
import { everything, Moves } from '../../../connection/records/index.ts';
import * as Picker from '../../../../../../ui/controls/picker/index.ts';
import { forkLatest, regenerateTitle, stop } from './api.ts';
import { isKey, rowsOf } from './keys.ts';

/*
 * Actions: what can be done where the user is, each with its keys as the
 * user bound them: `a` or Ctrl+K opens it on a session, `?` in Vim Mode or
 * Ctrl+? anywhere, and the Status Line's help.
 *
 * 1. Read    on a session, the Session, followed while open, for what
 *            applies to it, listed first: Settle or Un-settle; Fork from
 *            the latest Turn; Go to the original, for a Fork; Regenerate
 *            the title; Stop the Turn, while one runs. Then, with a
 *            keyboard, every Action of it that worked where it was opened,
 *            with its keys in either Mode (`keys.ts`); on touch, only the
 *            session's, and no keys named.
 * 2. Run     a session's action: the Picker waits while the server does
 *            it, then closes, and the app, and the keyboard, go to the
 *            Fork or the original for those two; a refusal is said in the
 *            Picker, which stays. Settle and Un-settle go through `Moves`,
 *            at once, as every Settle does, and the sidebar says a refusal.
 *            An Action of the keyboard is kept as the Picker closes, so the
 *            View runs it once the keyboard is back where the user was, as
 *            its keys would there.
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

/** What the list is opened with, besides the session's row. */
const Listing = Schema.Struct({
  bindings: Bindings,
  /** Whether it was opened on a session. */
  here: Schema.Boolean,
  /** The Actions of the keyboard that worked where it was opened, by id. */
  available: Schema.Array(Schema.String),
  vim: Schema.Boolean,
  /** Whether it was opened with a keyboard: on touch no keys are named. */
  keyboard: Schema.Boolean,
});

const List = Picker.make('Actions', {
  props: Schema.Struct({
    session: Schema.NullOr(Open),
    ...Listing.fields,
  }),
  steps: {
    action: {
      placeholder: ({ props }) =>
        props.keyboard ? 'Search actions, by name or key' : 'Search actions',
      empty: () => 'No action by that name',
      rows: ({ props }) => {
        const { session, bindings } = props;
        const stopKeys = props.keyboard
          ? boundIn(bindings, 'content.stop')
          : null;
        const sessionRows =
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
              ].map((row) => ({ ...row, group: 'This session' }));
        return {
          rows: [...sessionRows, ...(props.keyboard ? rowsOf(props) : [])],
          loading: props.here && session === null,
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

/** The session it is opened on, and its Connection. */
const At = Schema.Struct({
  connectionId: Schema.String,
  sessionId: Schema.String,
});

export const Actions = Actor.define('Actions', {
  requires: [CodeClients, Moves, Navigation, Replicas],
  props: Schema.Struct({ bindings: Bindings }),
  model: Schema.Struct({
    picking: Schema.NullOr(Picker.How),
    opened: Schema.Finite,
    /** The Session it was opened on, and its Connection; empty on none. */
    connectionId: Schema.String,
    sessionId: Schema.String,
    session: Schema.NullOr(Open),
    /** The Actions of the keyboard that worked where it was opened. */
    available: Schema.Array(Schema.String),
    vim: Schema.Boolean,
    keyboard: Schema.Boolean,
    /** The Action of the keyboard chosen, to run once the Picker is closed. */
    chosen: Schema.NullOr(Schema.String),
    /** Where the app goes as the Picker closes, after an action. */
    after: Schema.NullOr(
      Schema.Struct({ projectId: Schema.String, sessionId: Schema.String }),
    ),
  }),
  message: Schema.TaggedUnion({
    Open: {
      how: Picker.How,
      at: Schema.NullOr(At),
      available: Schema.Array(Schema.String),
      vim: Schema.Boolean,
      keyboard: Schema.Boolean,
    },
    Read: { session: Schema.NullOr(Open) },
    Closed: {},
    /** Done, and where to go after, if anywhere. */
    Ran: {
      go: Schema.NullOr(
        Schema.Struct({ projectId: Schema.String, sessionId: Schema.String }),
      ),
    },
    /** An Action of the keyboard chosen. */
    Chose: { id: Schema.String },
    /** The Action chosen was run. */
    KeyRan: {},
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

export const ActionsLive = Actor.build(Actions, {
  init: () => ({
    model: {
      picking: null,
      opened: 0,
      connectionId: '',
      sessionId: '',
      session: null,
      available: [],
      vim: false,
      keyboard: true,
      chosen: null,
      after: null,
    },
  }),
  children: {
    picker: {
      actor: List.Live,
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
        here: model.sessionId !== '',
        available: model.available,
        vim: model.vim,
        keyboard: model.keyboard,
      }),
    },
  },
  provides: (self) =>
    Layer.unwrap(
      Effect.map(Effect.context<CodeClients | Moves>(), (client) =>
        List.owner({
          done: () => self.send({ _tag: 'Closed' }),
          settle: (choices) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const action = choices.at(-1)?.value ?? '';
              // An Action of the keyboard runs once the Picker is closed.
              if (isKey(action)) {
                yield* self.send({ _tag: 'Chose', id: action });
                return null;
              }
              if (model.session === null) return 'This session is not found';
              const { connectionId, session } = model;
              const go =
                action === 'settle' || action === 'unsettle'
                  ? yield* Effect.flatMap(Moves, (moves) =>
                      moves.put(
                        { connectionId, sessionId: session.id },
                        action === 'settle',
                      ),
                    ).pipe(Effect.as(null), Effect.provide(client))
                  : yield* CodeClients.on(
                      connectionId,
                      run(action, session),
                    ).pipe(Effect.provide(client));
              yield* self.send({ _tag: 'Ran', go });
              return null;
            }).pipe(Effect.catch((reason) => Effect.succeed(reason))),
        }),
      ),
    ),
  workers: {
    // 1. Read
    session: {
      while: ({ model }) => model.picking !== null && model.sessionId !== '',
      run: (self) =>
        Effect.flatMap(self.get, ({ model }) =>
          Stream.runForEach(everything([model.connectionId]), ({ sessions }) =>
            self.send({
              _tag: 'Read',
              session: openOf(sessions, model.sessionId),
            }),
          ),
        ),
    },
  },
  on: {
    Open: ({ how, at, available, vim, keyboard }, { model }) => {
      if (model.picking !== null) return {};
      const connectionId = at?.connectionId ?? '';
      const sessionId = at?.sessionId ?? '';
      return {
        model: {
          picking: how,
          opened: model.opened + 1,
          connectionId,
          sessionId,
          session:
            model.connectionId === connectionId && model.sessionId === sessionId
              ? model.session
              : null,
          available,
          vim,
          keyboard,
          chosen: null,
          after: null,
        },
      };
    },
    Read: ({ session }, { model }) => ({ model: { ...model, session } }),
    // 2. Run: done, then, as the Picker closes, gone where it leads.
    Ran: ({ go }, { model }) => ({ model: { ...model, after: go } }),
    Chose: ({ id }, { model }) => ({ model: { ...model, chosen: id } }),
    KeyRan: (_, { model }) => ({ model: { ...model, chosen: null } }),
    Closed: (_, { model }) => ({
      model: { ...model, picking: null, after: null },
      ...(model.after === null
        ? {}
        : {
            command: Router.push(
              sessionPlace(
                model.connectionId,
                model.after.projectId,
                model.after.sessionId,
              ),
            ),
          }),
    }),
  },
});

export const ListView = List.View;
