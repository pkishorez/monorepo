import { Context, Effect, Layer } from 'effect';
import type { StdTableService } from '@kestack/std-toolkit/db';
import type { IDBTableSource } from '@kestack/std-toolkit/db/idb';
import { Memory } from '@kestack/std-toolkit/db/memory';
import type { Dial } from '@kestack/rpc-toolkit/rpc/websocket';
import type { CloudClient } from '../cloud/client/index.js';
import { connectionsTable } from '../cloud/worker/store/index.js';
import {
  CodeClients,
  type ConnectionAddress,
} from '../connection/plugins/code/api/index.js';
import { aiTable } from '../connection/plugins/code/engine/index.js';
import { cloudOver, type CloudOptions } from './cloud.js';
import { Computers } from './computers/index.js';
import { runs } from './runs.js';

/*
 * Connect in a browser tab, for fake mode: everything between an App and
 * the computers runs here for real, and only the computers themselves are
 * given, as `Computers`.
 *
 * 1. Cloud    Connect Cloud's handlers over its table, in-process
 *             (cloud.ts): `CloudClient`, which an App calls as it calls
 *             the deployed one, signed by its own Accounts.
 * 2. Beat     each online computer's Heartbeat, as `ke-connect` sends it,
 *             to that Connect Cloud, so it is listed, Ready at its tunnel's
 *             address, and Down once it stops reporting (runs.ts).
 * 3. Plugin   each online computer's code Plugin, the real Engine and
 *             handlers over the computer's edges, started for its first
 *             socket and shared by every other, stopped as the computer
 *             goes offline, is removed or starts again.
 * 4. Tunnels  what dials a computer's tunnel, `https://<name>.computers.fake`:
 *             a socket held in memory, answered as `ke-connect`'s server
 *             answers it (key, Release), so an App's own socket code runs
 *             as it does over the network. `tunnelClients` is `CodeClients`
 *             over them, in place of `CodeClients.layer`.
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

/**
 * Connect in this tab over `Computers`: Connect Cloud's client, and what
 * dials the computers' tunnels, for as long as the Layer.
 */
export const inTab = (
  options: InTabOptions = {},
): Layer.Layer<CloudClient | Tunnels, never, Computers> =>
  Layer.unwrap(
    Effect.gen(function* () {
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
      const { dial } = yield* runs(yield* Computers, {
        heartbeat: cloud.heartbeat,
        storeOf: (id) => tableIn(aiTable, `code-plugin ${id}`),
        every: HEARTBEAT,
      });
      return Layer.merge(cloud.client, Layer.succeed(Tunnels, { dial }));
    }),
  );

/** `CodeClients` over this tab's tunnels: each Connection's socket at the address `ConnectionAddress` gives. */
export const tunnelClients: Layer.Layer<
  CodeClients,
  never,
  ConnectionAddress | Tunnels
> = Layer.unwrap(Effect.map(Tunnels, ({ dial }) => CodeClients.dialing(dial)));
