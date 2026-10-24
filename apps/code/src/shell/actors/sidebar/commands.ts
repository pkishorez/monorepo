import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState, Machines } from '../../../layer/capabilities/index.ts';
import { Moves } from '../../moves/index.ts';

/*
 * What the sidebar asks for: the Machine it shows kept in Device State,
 * the Machine List asked again, and each Session put, through `Moves`.
 */

/** Keeps the Machine the sidebar shows; a write that fails is lost. */
export const setSidebarMachine = Command.make('SetSidebarMachine', {
  args: Schema.Struct({ machineId: Schema.NullOr(Schema.String) }),
  run: ({ machineId }) =>
    Effect.flatMap(DeviceState, (store) =>
      store.setSidebarMachine(machineId),
    ).pipe(Effect.ignore),
});

/** Asks the Backend for the Machines again now. */
export const reload = Command.make('ReloadMachines', {
  run: () => Effect.flatMap(Machines, (machines) => machines.reload),
});

const Put = Schema.Struct({
  machineId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
});

/**
 * Puts a Session through `Moves`: at once, or as a swipe, waiting out its
 * Undo; a swipe titled is said, with its Undo, once it is kept.
 */
export const putMove = Command.make('PutMove', {
  args: Schema.Struct({
    ...Put.fields,
    title: Schema.NullOr(Schema.String),
    now: Schema.Boolean,
  }),
  run: ({ machineId, sessionId, settled, title, now }) =>
    Effect.flatMap(Moves, (moves) =>
      (now ? moves.set : moves.swipe)({ machineId, sessionId }, settled),
    ).pipe(
      Effect.as(
        title === null
          ? undefined
          : {
              _tag: 'MoveKept' as const,
              machineId,
              sessionId,
              settled,
              title,
            },
      ),
    ),
});

/** The Session as synced is where it was put. */
export const agreed = Command.make('AgreedMove', {
  args: Put,
  run: ({ machineId, sessionId, settled }) =>
    Effect.flatMap(Moves, (moves) =>
      moves.agreed({ machineId, sessionId }, settled),
    ),
});

/** The page is going: everything waiting is asked now. */
export const hurry = Command.make('HurryMoves', {
  run: () => Effect.flatMap(Moves, (moves) => moves.hurry),
});
