import { Effect } from 'effect';
import { Authz } from '@kestack/auth-toolkit';
import { HeartbeatApi } from '../../../heartbeat/index.js';
import { Connections, type Latest } from '../store/index.js';

/*
 * The Heartbeat as Connect Cloud answers it, for the signed-in caller: a
 * Report is kept and answered with the Releases every Connection is told to
 * run, `latest.wanted`; Forget forgets the caller's Connection for good. A
 * caller below the Minimum Connect never gets here: worker.ts answers it 426.
 */

/** The handlers of `HeartbeatApi`, over the `connections` table. */
export const heartbeatHandlers = (latest: Latest) =>
  HeartbeatApi.toLayer({
    Report: (input) =>
      Effect.flatMap(Authz.User, (principal) =>
        Effect.as(Connections.report(principal, input), {
          wanted: latest.wanted,
        }),
      ),
    Forget: ({ id }) =>
      Effect.flatMap(Authz.User, (principal) =>
        Connections.forget(principal, id),
      ),
  });
