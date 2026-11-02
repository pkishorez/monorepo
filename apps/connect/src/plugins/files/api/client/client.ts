import { Context, Effect, Layer } from 'effect';
import type { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { FilesApi } from '../contract/index.js';
import {
  PluginClients,
  pluginSocket,
  type Address,
  type PluginApi,
} from '../../../link/index.js';

/*
 * What an App needs to call the files Plugin on its Connections: each
 * Connection's `FilesApi` over its own socket, beside the code Plugin's,
 * opened and linked the same way (`PluginClients`).
 *
 * 1. Find     `FilesAddress`, which the App gives, says where a
 *             Connection's files Plugin is, at the Release the App was built
 *             with, `<tunnel>/files/<sha256>/rpc` (`pluginPath`), and the
 *             Connection Key it asks for, again before every connect.
 * 2. Open     `FilesClients` opens one socket per Connection the first time
 *             anything holds it, and closes it a while after the last lets
 *             go. A Connection running another Release closes it with
 *             `PLUGIN_MISMATCH`.
 * 3. Show     a File Ticket's `url` is a path on the Connection's tunnel:
 *             `ticketUrlAt` and `FilesAddress.ticketUrl` make it one a
 *             browser opens from anywhere.
 */

export class FilesClient extends Context.Service<
  FilesClient,
  PluginApi<typeof FilesApi>
>()('@kestack/connect/FilesClient') {
  /**
   * The API at `url`, an absolute `ws(s)://…/files/<sha256>/rpc` or a path
   * in a browser, proving itself with the Connection's `key` when given one.
   */
  static readonly layer = (
    url: string,
    options?: { readonly key?: string | undefined },
  ) => pluginSocket(FilesClient, FilesApi, { url, key: options?.key });
}

/** One Connection's `FilesApi` and its socket, as `FilesClients` holds them. */
export type FilesConnectionClient = Context.Context<
  FilesClient | RpcConnection
>;

// 3. Show
/**
 * A File Ticket's `url`, a path on the tunnel, at the address of the
 * Connection's socket `socketUrl`: `wss://host/…` gives
 * `https://host/files/public/…`. A `socketUrl` that is a path, in a
 * browser, leaves it a path, read from the page's own address.
 */
export const ticketUrlAt = (socketUrl: string, ticketUrl: string): string => {
  if (!URL.canParse(socketUrl)) return ticketUrl;
  const at = new URL(ticketUrl, socketUrl);
  if (at.protocol === 'wss:') at.protocol = 'https:';
  else if (at.protocol === 'ws:') at.protocol = 'http:';
  return at.href;
};

// 1. Find
/**
 * Where each Connection's files Plugin is, by its id: the App gives it.
 * `of` is run before every connect, and may wait, for as long as it takes,
 * until the Connection can be reached.
 */
export class FilesAddress extends Context.Service<
  FilesAddress,
  { readonly of: (connectionId: string) => Effect.Effect<Address> }
>()('@kestack/connect/FilesAddress') {
  /** A File Ticket's `url` on one Connection, as a browser opens it, once the Connection can be reached. */
  static readonly ticketUrl = (
    connectionId: string,
    ticketUrl: string,
  ): Effect.Effect<string, never, FilesAddress> =>
    Effect.flatMap(FilesAddress, ({ of }) =>
      Effect.map(of(connectionId), ({ url }) => ticketUrlAt(url, ticketUrl)),
    );
}

// 2. Open
/**
 * Every Connection's files client, by Connection id. `hold` gives a
 * Connection's API and its socket for as long as the Scope lasts; the
 * first holder opens it, and it closes once nothing has held it for a
 * while.
 */
export class FilesClients extends PluginClients<FilesClients>()(
  '@kestack/connect/FilesClients',
  FilesApi,
  FilesClient,
) {
  /** Each Connection's socket at the address `FilesAddress` gives for its id. */
  static readonly layer: Layer.Layer<FilesClients, never, FilesAddress> =
    Layer.unwrap(Effect.map(FilesAddress, ({ of }) => FilesClients.at(of)));
}
