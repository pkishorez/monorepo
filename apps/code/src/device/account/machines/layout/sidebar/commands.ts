import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { MachineFilter } from '../../store.ts';
import { Machines } from '../../machines.ts';
import { Preferences } from '../../../../store.ts';
import { Moves } from '../../machine/records/index.ts';

/*
 * What the sidebar asks for: the Machine it shows kept as the Account's
 * Machine Filter, its width kept in Preferences, the Machine List asked
 * again, and each Session put, through `Moves`.
 */

/** Keeps the Machine the sidebar shows, for its Account; a write that fails is lost. */
export const setMachineFilter = Command.make('SetMachineFilter', {
  args: Schema.Struct({
    accountId: Schema.String,
    machineId: Schema.NullOr(Schema.String),
  }),
  run: ({ accountId, machineId }) =>
    Effect.flatMap(MachineFilter, (filter) =>
      filter.set(accountId, machineId),
    ).pipe(Effect.ignore),
});

/** Keeps the sidebar's width in Preferences; a write that fails is lost. */
export const setSidebarWidth = Command.make('SetSidebarWidth', {
  args: Schema.Struct({ width: Schema.Finite }),
  run: ({ width }) =>
    Effect.flatMap(Preferences, (store) => store.setSidebarWidth(width)).pipe(
      Effect.ignore,
    ),
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
