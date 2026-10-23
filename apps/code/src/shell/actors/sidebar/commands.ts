import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { DeviceState, Machines } from '../../../layer/capabilities/index.ts';

/*
 * What the sidebar asks for: the Machine it shows kept in Device State, and
 * the Machine List asked again.
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
