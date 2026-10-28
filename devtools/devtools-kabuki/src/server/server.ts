import { Layer } from 'effect';
import { accept } from './accept/index.ts';
import { forward } from './forward/index.ts';
import type { ForwardOptions } from './forward/index.ts';
import { layer as registry } from './registry/index.ts';

/*
 * Kabuki in DevTools, the server's side: the routes a DevTools Server
 * mounts on its HttpRouter.
 *
 * 1. Registry  the Kabuki Sessions live now, in memory.
 * 2. Accept    `/kabuki/connect`: each app that dials, from any origin,
 *              kept there while its socket is open.
 * 3. Forward   `/kabuki/sessions` and `/kabuki/session/:name`: the live
 *              list and one Kabuki Session's Api, for DevTools' own page
 *              and CLI only.
 */

export {
  KabukiSessionNotFound,
  KabukiSessionSummary,
  KabukiSessionsApi,
  SESSIONS_PATH,
  dialSession,
  dialSessions,
  sessionPath,
} from './forward/index.ts';
export type { KabukiSessionsClient } from './forward/index.ts';

export type KabukiRoutesOptions = ForwardOptions;

/** Every Kabuki route, sharing one registry; mount it with the DevTools Server's other routes. */
export const kabukiRoutes = (options: KabukiRoutesOptions) =>
  Layer.mergeAll(accept, forward(options)).pipe(Layer.provide(registry));
