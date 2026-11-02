import { Effect, Layer } from 'effect';
import { pluginPath } from '@kestack/connect/cloud';
import { CodeClients, ConnectionAddress } from '@kestack/connect/code';
import { FilesAddress, FilesClients } from '@kestack/connect/files';
import { Replicas } from '@kestack/std-toolkit/replica';
import { Connections } from '../../../connections.ts';
import { PLUGIN_CODE, PLUGIN_FILES } from './release.ts';

/*
 * How the app reaches every Connection of the signed-in Account's list.
 *
 * 1. Records  a Connection's `CodeReplica` Instance, keyed by its id, is held
 *             by that Connection's own Replicas, over its own sync Store, found
 *             through `Connections`: one runs only while the Connection is
 *             listed and runs here, so an address naming another Account's
 *             Connection never reads what this device keeps of it, and a page
 *             reads its Connection's Store and no other's.
 * 2. Socket   each Connection's socket dials its `https://` address, over
 *             `wss`, at the code Plugin's Release this Code was built with,
 *             `/code/<sha256>/rpc` (`release.ts`), offering its Connection
 *             Key as listed on each connect, so a Connection that comes
 *             back at a new address, as a quick tunnel does, is reached
 *             there. Until it is listed with one, its socket waits. A
 *             Connection running another Release closes it at once; who is
 *             behind is `release.ts`'s to say.
 * 3. Files    a second socket to each Connection, to its files Plugin at
 *             the Release this Code was built with, `/files/<sha256>/rpc`,
 *             found the same way, opened only once a File Embed asks for a
 *             File Ticket and closed a while after; and where a ticket's
 *             path is on the Connection, for the browser to open.
 */

/** 1. Records: each Connection's Instance, held by that Connection's Replicas once it runs, waiting until it does. */
export const byConnection = Layer.effect(
  Replicas,
  Effect.map(Connections, ({ replicas }) =>
    Replicas.of({
      hold: (replica, key) =>
        Effect.flatMap(replicas(key), (each) => each.hold(replica, key)),
    }),
  ),
);

/** Where each Connection's `plugin` is, at `release`, as listed, once it is. */
const where = (plugin: string, release: string) =>
  Effect.map(
    Connections,
    ({ reachable }) =>
      (connectionId: string) =>
        Effect.map(reachable(connectionId), ({ tunnel, key }) => ({
          url: `${tunnel}${pluginPath(plugin, release)}`,
          key,
        })),
  );

/** 2. Socket: where each Connection's code Plugin is, at `release`, as listed, once it is. */
export const addressAt = (release: string) =>
  Layer.effect(
    ConnectionAddress,
    Effect.map(where('code', release), (of) => ConnectionAddress.of({ of })),
  );

/** 3. Files: where each Connection's files Plugin is, at `release`, as listed, once it is. */
export const filesAddressAt = (release: string) =>
  Layer.effect(
    FilesAddress,
    Effect.map(where('files', release), (of) => FilesAddress.of({ of })),
  );

/** Every listed Connection's records and sockets, and where its File Tickets are, for the page that Provides them. */
export const reach = Layer.mergeAll(
  byConnection,
  CodeClients.layer.pipe(Layer.provide(addressAt(PLUGIN_CODE))),
  FilesClients.layer.pipe(Layer.provideMerge(filesAddressAt(PLUGIN_FILES))),
);
