import { Effect, Layer } from 'effect';
import { AiClients, MachineAddress } from '@kestack/ai-toolkit/client';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Machines } from './link.ts';

/*
 * How the app reaches every Machine of the signed-in Account's list. Each
 * Machine's `Ai` Instance opens only once the Machine is in the list, so
 * an address naming another Account's Machine never reads what this
 * device keeps of it; and each Machine's socket dials its `https://`
 * address, over `wss`, offering its Machine Key as listed on each connect,
 * so a Machine that comes back at a new address, as a quick tunnel does,
 * is reached there. Until it is listed with one, its socket waits.
 */

/** The Replicas below, holding a Machine's Instance only while it is listed, waiting until it is. */
export const listedOnly = Layer.effect(
  Replicas,
  Effect.gen(function* () {
    const replicas = yield* Replicas;
    const { listed } = yield* Machines;
    return Replicas.of({
      hold: (replica, key) =>
        Effect.andThen(listed(key), replicas.hold(replica, key)),
    });
  }),
);

/** Where each Machine is: as listed, once it is. */
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

/** Every listed Machine's Replicas and socket, for the page that Provides them. */
export const reach = Layer.mergeAll(
  listedOnly.pipe(Layer.provideMerge(Replicas.layer)),
  AiClients.layer.pipe(Layer.provide(address)),
);
