import { reach, type UserSpace } from '../user-space/index.ts';
import { rpc } from './rpc.ts';
import { visitorOf } from './visitor/index.ts';

/*
 * The Worker's routing: each request to its owner. A route of the Worker's
 * own is answered here, before Start: `/rpc` hands an invited member's
 * socket to their User Space. Everything else is Start's: the pages and the
 * Loader RPC.
 *
 * A new route is a file beside `rpc.ts` and one more case in `fetch` below,
 * as `/github/*` and `/runner` will be.
 */

/** What the Worker is bound to. */
export interface Env {
  readonly USER_SPACE: DurableObjectNamespace<UserSpace>;
  /** The Invite list: emails, comma-separated. */
  readonly CONSOLE_INVITES: string;
}

interface Handler {
  readonly fetch: (request: Request, env: unknown) => Promise<Response>;
}

/** The Worker: its own routes, then `start` for everything else. */
export const host = (start: Handler) => ({
  fetch: (request: Request, env: Env): Promise<Response> => {
    switch (new URL(request.url).pathname) {
      case '/rpc':
        return rpc(
          request,
          (request) => visitorOf(request, env.CONSOLE_INVITES),
          (visitor) => reach(env.USER_SPACE, visitor).socket(request),
        );
      default:
        return start.fetch(request, env);
    }
  },
});
