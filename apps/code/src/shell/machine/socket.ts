import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { AiApi } from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { CurrentMachine } from '../../replica/index.ts';
import { Machines, Records } from '../machines/index.ts';

/*
 * What one Machine's page Provides everything under it: the Machine's own
 * `AiClient` over its own socket, the Replicas that hold its `Ai`
 * Instance, and `CurrentMachine`, which names that Instance. All three are
 * built with the page and closed with it, so another Machine's socket can
 * never feed this Machine's records: switching Machine is a new page, and
 * so a new socket, new Replicas and a new Instance.
 *
 * The socket dials the Machine's `https://` address, over `wss`, and
 * offers its Machine Key as listed on each connect, so a Machine that
 * comes back at a new address, as a quick tunnel does, is reached there;
 * until it is listed with one, the socket waits. The Replicas open its
 * Instance only once it is in the signed-in Account's list, so a URL
 * naming another Account's Machine never reads what this device keeps of
 * it; and the page holds the Machine's records while open, so deleting
 * them waits for it to close.
 */

/** The Key offered to the Machine: the subprotocols `AiClient.layer` offers for it. */
const protocolsOf = (key: string) => ['ai-toolkit', `key.${key}`];

const socket = (machineId: string) =>
  Layer.unwrap(
    Effect.map(Machines, (machines) => {
      const machine = machines.reachable(machineId);
      return Layer.effect(AiClient, RpcClient.make(AiApi)).pipe(
        Layer.provideMerge(
          client(AiApi, {
            url: Effect.map(machine, ({ socket }) => socket),
            protocols: Effect.map(machine, ({ key }) => protocolsOf(key)),
          }),
        ),
      );
    }),
  );

/** The Replicas below, holding an Instance only while the Machine is listed, waiting until it is. */
export const listedOnly = (machineId: string) =>
  Layer.effect(
    Replicas,
    Effect.gen(function* () {
      const replicas = yield* Replicas;
      const { listed } = yield* Machines;
      return Replicas.of({
        hold: (replica, key) =>
          Effect.andThen(listed(machineId), replicas.hold(replica, key)),
      });
    }),
  );

/** The page holds the Machine's records while open. */
const holding = (machineId: string) =>
  Layer.effectDiscard(Records.use((records) => records.hold(machineId)));

/** Everything on one Machine: its socket, its Replicas, and which it is. */
export const onMachine = (machineId: string) =>
  Layer.mergeAll(
    socket(machineId),
    listedOnly(machineId).pipe(Layer.provideMerge(Replicas.layer)),
    CurrentMachine.layer(machineId),
    holding(machineId),
  );
