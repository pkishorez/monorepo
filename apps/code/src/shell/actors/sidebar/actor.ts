import { Effect, Schema, Stream } from 'effect';
import { AiClient, AiClients } from '@kestack/ai-toolkit/client';
import { Actor } from '@kestack/kabuki';
import { Navigation, Router } from '@kestack/kabuki/routing';
import { DeviceState, Machines } from '../../../layer/capabilities/index.ts';
import { session } from '../../places/index.ts';
import { orRefused } from '../../refusal/index.ts';
import { across, Projects, Sessions } from '../../replica/index.ts';
import { reload, setSidebarMachine } from './commands.ts';

/*
 * The sidebar: the Projects and Sessions of the Machine chosen, or of every
 * Machine, and what this device marks of them.
 *
 * 1. Machines  the list, as `Machines` says it, for the Machine Filter at
 *              its top, and Reload, which asks the Backend again.
 * 2. Choose    the Machine chosen is kept in Device State; one no longer
 *              listed shows every Machine. Only the Machines shown are
 *              read, so a Machine not shown syncs nothing here.
 * 3. Marks     the Unseen marks of this device, read again after every
 *              write, from this tab or another.
 * 4. Open      a Session the keyboard steps to.
 * 5. Unsettle  a Session from the Settled List, one at a time, on its own
 *              Machine; a refusal says why.
 * 6. Move      a Session swiped to Settle or un-Settle it, or its Undo:
 *              shown where it goes at once, and asked of its Machine one
 *              after another, in the order swiped, so an Undo lands after
 *              what it undoes. Kept until the Session as synced agrees
 *              (`MoveSeen`); a refusal puts it back and says why.
 */

const Listed = Schema.Struct({ id: Schema.String, name: Schema.String });

const Unsettling = Schema.Struct({
  machineId: Schema.String,
  sessionId: Schema.String,
  problem: Schema.NullOr(Schema.String),
});

const Move = Schema.Struct({
  /** Its place in the order swiped. */
  n: Schema.Finite,
  machineId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
  done: Schema.Boolean,
});

const Model = Schema.Struct({
  /** The listed Machines; null before any list. */
  machines: Schema.NullOr(Schema.Array(Listed)),
  /** Why the Backend could not list them, while nothing is listed. */
  problem: Schema.NullOr(Schema.String),
  /** The Machine chosen, as Device State keeps it; null for every Machine. */
  chosen: Schema.NullOr(Schema.String),
  /** This device's Unseen marks, by Machine id and then Session id. */
  unseen: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, Schema.Finite),
  ),
  /** The Session being Un-settled, and why its Machine refused, if it did. */
  unsettling: Schema.NullOr(Unsettling),
  /** The Sessions swiped, in the order swiped, until the synced rows agree. */
  moving: Schema.Array(Move),
  /** How many Moves were ever asked: the next one's `n`. */
  moves: Schema.Finite,
  /** The last Move refused, numbered so each is said once. */
  refused: Schema.NullOr(
    Schema.Struct({
      n: Schema.Finite,
      settled: Schema.Boolean,
      reason: Schema.String,
    }),
  ),
});
type Model = typeof Model.Type;

/** A Session swiped, where it goes, and whether its Machine has done it. */
type Move = typeof Move.Type;

const Sidebar = Actor.define('Sidebar', {
  requires: [Machines, DeviceState, AiClients, Navigation],
  model: Model,
  message: Schema.TaggedUnion({
    MachinesKnown: {
      machines: Schema.NullOr(Schema.Array(Listed)),
      problem: Schema.NullOr(Schema.String),
    },
    DeviceRead: {
      chosen: Schema.NullOr(Schema.String),
      unseen: Model.fields.unseen,
    },
    MachineChosen: { machineId: Schema.NullOr(Schema.String) },
    ReloadAsked: {},
    SessionOpened: {
      machineId: Schema.String,
      projectId: Schema.String,
      sessionId: Schema.String,
    },
    UnsettleAsked: { machineId: Schema.String, sessionId: Schema.String },
    Unsettled: { sessionId: Schema.String },
    UnsettleRefused: { sessionId: Schema.String, reason: Schema.String },
    MoveAsked: {
      machineId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
    },
    Moved: {
      machineId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
    },
    MoveRefused: {
      machineId: Schema.String,
      sessionId: Schema.String,
      settled: Schema.Boolean,
      reason: Schema.String,
    },
    MoveSeen: { machineId: Schema.String, sessionId: Schema.String },
  }),
});

/** The Machine shown: the one chosen while it is listed, else none, for every Machine. */
export const shownOf = ({ machines, chosen }: Model) =>
  chosen !== null && machines?.some(({ id }) => id === chosen) === true
    ? chosen
    : null;

/** The Machines whose Projects and Sessions are read. */
const readOf = (model: Model) => {
  const shown = shownOf(model);
  return shown === null ? (model.machines ?? []).map(({ id }) => id) : [shown];
};

const sameListed = Schema.toEquivalence(Model.fields.machines);

const sameSession =
  (machineId: string, sessionId: string) =>
  (move: { readonly machineId: string; readonly sessionId: string }) =>
    move.machineId === machineId && move.sessionId === sessionId;

/** The Moves with the one for this Session left out. */
const without = (
  moving: ReadonlyArray<Move>,
  machineId: string,
  sessionId: string,
) => moving.filter((move) => !sameSession(machineId, sessionId)(move));

export const SidebarLive = Actor.build(Sidebar, {
  init: () => ({
    model: {
      machines: null,
      problem: null,
      chosen: null,
      unseen: {},
      unsettling: null,
      moving: [],
      moves: 0,
      refused: null,
    },
  }),
  children: {
    projects: {
      actor: Projects,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, key) => across.props(key),
    },
    sessions: {
      actor: Sessions,
      each: ({ model }) => across.each(readOf(model)),
      props: (_, key) => across.props(key),
    },
  },
  workers: {
    // 6. Move: the first not yet done, then the next, till none are left.
    move: {
      while: ({ model }) => model.moving.some(({ done }) => !done),
      run: (self) => {
        // The last asked of a Machine here, as the model may not show it done yet.
        let last = -1;
        return Effect.forever(
          Effect.gen(function* () {
            const next = (yield* self.get).model.moving.find(
              ({ n, done }) => !done && n > last,
            );
            // Nothing new: look again shortly, till every Move is done.
            if (next === undefined) return yield* Effect.sleep('50 millis');
            last = next.n;
            const { machineId, sessionId, settled } = next;
            const ended = yield* orRefused(
              AiClients.on(
                machineId,
                AiClient.use((api) =>
                  settled
                    ? api.settleSession({ sessionId })
                    : api.unsettleSession({ sessionId }),
                ),
              ),
              () => ({ _tag: 'Moved' as const }),
            );
            yield* self.send(
              ended._tag === 'Refused'
                ? {
                    _tag: 'MoveRefused',
                    machineId,
                    sessionId,
                    settled,
                    reason: ended.reason,
                  }
                : { _tag: 'Moved', machineId, sessionId, settled },
            );
          }),
        );
      },
    },
    // 1. Machines: only their ids and names, so a line or a Heartbeat
    // changes nothing here.
    known: {
      run: (self) =>
        Effect.flatMap(Machines, ({ state }) =>
          state.pipe(
            Stream.map(({ machines, problem }) => ({
              machines: machines?.map(({ id, name }) => ({ id, name })) ?? null,
              problem: machines === null ? problem : null,
            })),
            Stream.changesWith(
              (a, b) =>
                a.problem === b.problem && sameListed(a.machines, b.machines),
            ),
            Stream.runForEach((known) =>
              self.send({ _tag: 'MachinesKnown', ...known }),
            ),
          ),
        ),
    },
    // 2. Choose, 3. Marks
    device: {
      run: (self) =>
        Stream.concat(Stream.make(undefined), DeviceState.changes).pipe(
          Stream.runForEach(() =>
            Effect.flatMap(DeviceState.read, ({ sidebarMachine, unseen }) =>
              self.send({ _tag: 'DeviceRead', chosen: sidebarMachine, unseen }),
            ),
          ),
        ),
    },
    // 5. Unsettle
    unsettle: {
      while: ({ model }) =>
        model.unsettling !== null && model.unsettling.problem === null,
      run: (self) =>
        Effect.gen(function* () {
          const { unsettling } = (yield* self.get).model;
          if (unsettling === null) return;
          const { machineId, sessionId } = unsettling;
          yield* self.send(
            yield* orRefused(
              AiClients.on(
                machineId,
                AiClient.use((api) => api.unsettleSession({ sessionId })),
              ),
              () => ({ _tag: 'Unsettled' as const, sessionId }),
            ).pipe(
              Effect.map((ended) =>
                ended._tag === 'Refused'
                  ? {
                      _tag: 'UnsettleRefused' as const,
                      sessionId,
                      reason: ended.reason,
                    }
                  : ended,
              ),
            ),
          );
        }),
    },
  },
  on: {
    // 6. Move: where it goes now, after any Move not yet done.
    MoveAsked: ({ machineId, sessionId, settled }, { model }) => ({
      model: {
        ...model,
        moving: [
          ...without(model.moving, machineId, sessionId),
          { n: model.moves, machineId, sessionId, settled, done: false },
        ],
        moves: model.moves + 1,
      },
    }),
    // Done, unless an Undo has since asked the other way.
    Moved: ({ machineId, sessionId, settled }, { model }) => ({
      model: {
        ...model,
        moving: model.moving.map((move) =>
          sameSession(machineId, sessionId)(move) && move.settled === settled
            ? { ...move, done: true }
            : move,
        ),
      },
    }),
    MoveRefused: ({ machineId, sessionId, settled, reason }, { model }) =>
      model.moving.some(
        (move) =>
          sameSession(machineId, sessionId)(move) && move.settled === settled,
      )
        ? {
            model: {
              ...model,
              moving: without(model.moving, machineId, sessionId),
              refused: { n: (model.refused?.n ?? 0) + 1, settled, reason },
            },
          }
        : {},
    MoveSeen: ({ machineId, sessionId }, { model }) => ({
      model: {
        ...model,
        moving: model.moving.filter(
          (move) => !(sameSession(machineId, sessionId)(move) && move.done),
        ),
      },
    }),
    MachinesKnown: ({ machines, problem }, { model }) => ({
      model: { ...model, machines, problem },
    }),
    DeviceRead: ({ chosen, unseen }, { model }) => ({
      model: { ...model, chosen, unseen },
    }),
    // Shown at once, and kept.
    MachineChosen: ({ machineId }, { model }) => ({
      model: { ...model, chosen: machineId },
      command: setSidebarMachine({ machineId }),
    }),
    ReloadAsked: () => ({ command: reload() }),
    SessionOpened: ({ machineId, projectId, sessionId }) => ({
      command: Router.push(session(machineId, projectId, sessionId)),
    }),
    UnsettleAsked: ({ machineId, sessionId }, { model }) =>
      model.unsettling !== null && model.unsettling.problem === null
        ? {}
        : {
            model: {
              ...model,
              unsettling: { machineId, sessionId, problem: null },
            },
          },
    Unsettled: ({ sessionId }, { model }) =>
      model.unsettling?.sessionId === sessionId
        ? { model: { ...model, unsettling: null } }
        : {},
    UnsettleRefused: ({ sessionId, reason }, { model }) =>
      model.unsettling?.sessionId === sessionId
        ? {
            model: {
              ...model,
              unsettling: { ...model.unsettling, problem: reason },
            },
          }
        : {},
  },
});
