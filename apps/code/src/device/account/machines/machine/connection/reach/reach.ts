import { Effect, Layer } from 'effect';
import { CodeClients, MachineAddress } from '@kestack/connect/code';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Machines } from '../../../machines.ts';

/*
 * How the app reaches every Machine of the signed-in Account's list.
 *
 * 1. Records  a Machine's `CodeReplica` Instance, keyed by its id, is held
 *             by that Machine's own Replicas, over its own sync Store, found
 *             through `Machines`: one runs only while the Machine is
 *             listed and runs here, so an address naming another Account's
 *             Machine never reads what this device keeps of it, and a page
 *             reads its Machine's Store and no other's.
 * 2. Socket   each Machine's socket dials its `https://` address, over
 *             `wss`, offering its Machine Key as listed on each connect,
 *             so a Machine that comes back at a new address, as a quick
 *             tunnel does, is reached there. Until it is listed with one,
 *             its socket waits.
 */

/** 1. Records: each Machine's Instance, held by that Machine's Replicas once it runs, waiting until it does. */
export const byMachine = Layer.effect(
  Replicas,
  Effect.map(Machines, ({ replicas }) =>
    Replicas.of({
      hold: (replica, key) =>
        Effect.flatMap(replicas(key), (each) => each.hold(replica, key)),
    }),
  ),
);

/** 2. Socket: where each Machine is, as listed, once it is. */
const address = Layer.effect(
  MachineAddress,
  Effect.map(Machines, ({ reachable }) =>
    MachineAddress.of({
      of: (machineId) =>
        Effect.map(reachable(machineId), ({ socket, key }) => ({
          url: socket,
          key,
        })),
    }),
  ),
);

/** Every listed Machine's records and socket, for the page that Provides them. */
export const reach = Layer.mergeAll(
  byMachine,
  CodeClients.layer.pipe(Layer.provide(address)),
);
