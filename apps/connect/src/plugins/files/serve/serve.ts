import { homedir } from 'node:os';
import { Effect, Layer } from 'effect';
import { FilesApi } from '../api/contract/index.js';
import { requestFile } from './request.js';
import { publicRoutes } from './routes.js';
import { Tickets } from './tickets.js';

/*
 * The files Plugin: what a Connection runs for any App that shows its
 * files. `requestFile` gives File Tickets and the Public Area serves them,
 * both over the one set of Tickets its Layer keeps, swept for as long as
 * it runs. It keeps nothing on disk.
 */

export interface FilesPluginOptions {
  /** The folder a leading `~` names; the user's home unless given. */
  readonly home?: string;
}

/** The files Plugin: `FilesApi`, the Layer of its handlers and of the Tickets its routes read, and its Public Area's routes. */
export const filesPlugin = (options: FilesPluginOptions = {}) => {
  const layer = FilesApi.toLayer(
    Effect.map(Tickets, (tickets) => ({
      requestFile: (payload) =>
        requestFile(options.home ?? homedir())(payload).pipe(
          Effect.provideService(Tickets, tickets),
        ),
    })),
  ).pipe(Layer.provideMerge(Tickets.layer));
  return { api: FilesApi, layer, publicRoutes };
};
