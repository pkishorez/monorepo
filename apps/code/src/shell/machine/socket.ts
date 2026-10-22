import { Effect, Layer } from 'effect';
import { RpcClient } from 'effect/rpc';
import { AiApi } from '@kestack/ai-toolkit/api';
import { AiClient } from '@kestack/ai-toolkit/client';
import { client } from '@kestack/rpc-toolkit/rpc/websocket';
import { Replicas } from '@kestack/std-toolkit/replica';
import { CurrentMachine } from '../../replica/index.ts';
import { Machines, socketUrl } from '../machines/index.ts';

/*
 * What one Machine's page Provides everything under it: the Machine's own
 * `AiClient` over its own socket, the Replicas that hold its `Ai`
 * Instance, and `CurrentMachine`, which names that Instance. All three are
 * built with the page and closed with it, so another Machine's socket can
 * never feed this Machine's records: switching Machine is a new page, and
 * so a new socket, new Replicas and a new Instance.
 *
 * The socket dials the Machine's address and offers its Machine Key as
 * listed on each connect, so a Machine that comes back at a new address,
 * as a quick tunnel does, is reached there; until it is listed with one,
 * the socket waits.
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
            url: Effect.map(machine, ({ url }) => socketUrl(url ?? '')),
            protocols: Effect.map(machine, ({ key }) => protocolsOf(key)),
          }),
        ),
      );
    }),
  );

/** Everything on one Machine: its socket, its Replicas, and which it is. */
export const onMachine = (machineId: string) =>
  Layer.mergeAll(
    socket(machineId),
    Replicas.layer,
    CurrentMachine.layer(machineId),
  );
