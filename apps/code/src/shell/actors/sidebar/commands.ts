import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState, Machines } from '../../../layer/capabilities/index.ts';
import { Moves } from '../moves/index.ts';

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

/** Asks Cloud Connect for the Machines again now. */
export const reload = Command.make('ReloadMachines', {
  run: () => Effect.flatMap(Machines, (machines) => machines.reload),
});

const Put = Schema.Struct({
  machineId: Schema.String,
  sessionId: Schema.String,
  settled: Schema.Boolean,
});

/** Puts a Session through `Moves`, which asks its Machine at once. */
export const putMove = Command.make('PutMove', {
  args: Put,
  run: ({ machineId, sessionId, settled }) =>
    Effect.flatMap(Moves, (moves) =>
      moves.put({ machineId, sessionId }, settled),
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
