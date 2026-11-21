import { Context, Effect, Layer, Schedule } from 'effect';
import type { StdTableService } from '@kestack/std-toolkit/db';
import type { IDBTableSource } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import type { Dial } from '@kestack/rpc-toolkit/rpc/websocket';
import { addressOf, CloudClient } from '../cloud/client/index.js';
import { connectionsTable } from '../cloud/worker/store/index.js';
import {
  CodeClients,
  ConnectionAddress,
  pluginPath,
} from '../connection/plugins/code/api/index.js';
import { aiTable } from '../connection/plugins/code/engine/index.js';
import { cloudOver, type CloudOptions } from './cloud.js';
import {
  type AgentEdges,
  Computers,
  type ConnectCloud,
} from './computers/index.js';
import { runs } from './runs.js';

/*
 * Connect in a browser tab, for fake mode: everything between an App and
 * the computers runs here for real, and only the outside world is given:
 * the computers (`Computers`), what Connect Cloud is deployed with
 * (`ConnectCloud`), and the Agent's and Speech's edges every computer's
 * code Plugin shares (`AgentEdges`).
 *
 * 1. Cloud    Connect Cloud's handlers over its table, in-process
 *             (cloud.ts): `CloudClient`, which an App calls as it calls
 *             the deployed one, signed by its own Accounts.
 * 2. Beat     each online computer's Heartbeat, as `ke-connect` sends it,
 *             to that Connect Cloud, so it is listed, Ready at its tunnel's
 *             address, and Down once it stops reporting (runs.ts).
 * 3. Plugin   each online computer's code Plugin, the real Engine and
 *             handlers over the computer's edges and the shared ones,
 *             started for its first socket and shared by every other,
 *             stopped as the computer goes offline, is removed or starts
 *             again.
 * 4. Tunnels  what dials a computer's tunnel, `https://<name>.computers.fake`:
 *             a socket held in memory, answered as `ke-connect`'s server
 *             answers it (key, Release), so an App's own socket code runs
 *             as it does over the network. `tunnelClients` is `CodeClients`
 *             over them, in place of `CodeClients.layer`.
 * 5. Another  once it all runs, `Computers` is given how another device
 *             of the signed-in User reaches it: Connect Cloud's client, and
 *             each Connection's code Plugin at the App's Release, at the
 *             address Connect Cloud lists.
 *
 * Each table is kept by `tables`, by the name of its database: Connect
 * Cloud's, and each computer's code Plugin's own. Memory unless given.
 */

/** Where the tab keeps a table, in the database of `name`: Memory, IndexedDB. */
export type Tables = <Name extends string>(
  table: IDBTableSource<Name>,
  database: string,
) => Layer.Layer<StdTableService<Name>>;

/** Every table in memory: gone with the tab. */
const inMemory: Tables = (table) => Memory.make(table).layer;

/** How often a computer reports, as `ke-connect` does unless told otherwise. */
const HEARTBEAT = '15 seconds';

export interface InTabOptions extends CloudOptions {
  /** Where each table is kept; in memory unless given. */
  readonly tables?: Tables | undefined;
}

/** What dials a computer's tunnel in this tab, in place of the browser's WebSocket. */
export class Tunnels extends Context.Service<
  Tunnels,
  { readonly dial: Dial }
>()('@kestack/connect/Tunnels') {}

/** How often another device asks Connect Cloud for a Connection's address, until it is listed up at one. */
const UNTIL_LISTED = Schedule.spaced('1 second');

/**
 * Connect in this tab over the outside world: Connect Cloud's client, and
 * what dials the computers' tunnels, for as long as the Layer.
 */
export const inTab = (
  options: InTabOptions = {},
): Layer.Layer<
  CloudClient | Tunnels,
  never,
  Computers | ConnectCloud | AgentEdges
> =>
  Layer.unwrap(
    Effect.gen(function* () {
      // The mark every fake carries: a production build that has it fails.
      yield* Effect.logDebug('kestack-fake: Connect runs in this tab');
      const kept = new Map<string, unknown>();
      // One Layer per database, so a Memory table outlives each start.
      const tableIn = <Name extends string>(
        table: IDBTableSource<Name>,
        database: string,
      ) => {
        const found = kept.get(database);
        if (found !== undefined)
          return found as Layer.Layer<StdTableService<Name>>;
        const made = (options.tables ?? inMemory)(table, database);
        kept.set(database, made);
        return made;
      };
      const cloud = yield* cloudOver(
        tableIn(connectionsTable, 'connect-cloud'),
        options,
      );
      const computers = yield* Computers;
      const { dial } = yield* runs(computers, {
        heartbeat: cloud.heartbeat,
        pushBack: cloud.pushBack,
        storeOf: (id) => tableIn(aiTable, `code-plugin ${id}`),
        shared: Layer.succeedContext(yield* Effect.context<AgentEdges>()),
        every: HEARTBEAT,
      });

      // 5. Another
      const release = options.wanted?.['code']?.hash;
      const address = Layer.succeed(ConnectionAddress, {
        of: (id) =>
          Effect.gen(function* () {
            const listed = yield* cloud.client.List({});
            const found = listed.find((each) => each.id === id);
            const tunnel = found && addressOf(found.status);
            if (!found || !tunnel || release === undefined)
              return yield* Effect.fail('not up yet');
            return {
              url: `${tunnel}${pluginPath('code', release)}`,
              key: found.key,
            };
          }).pipe(Effect.retry(UNTIL_LISTED), Effect.orDie),
      });
      const code = yield* Layer.build(
        CodeClients.dialing(dial).pipe(Layer.provide(address)),
      );
      yield* computers.anotherDevice({
        cloud: cloud.client,
        code: Context.get(code, CodeClients),
      });

      return Layer.mergeAll(
        Layer.succeed(CloudClient, cloud.client),
        Layer.succeed(Tunnels, { dial }),
      );
    }),
  );

/** `CodeClients` over this tab's tunnels: each Connection's socket at the address `ConnectionAddress` gives. */
export const tunnelClients: Layer.Layer<
  CodeClients,
  never,
  ConnectionAddress | Tunnels
> = Layer.unwrap(Effect.map(Tunnels, ({ dial }) => CodeClients.dialing(dial)));
