import { Context, type Duration, type Effect } from 'effect';
import type { ConnectionStatus, Release } from '../../../../heartbeat/index.js';

/*
 * Connect Cloud as everything under Identity sees it: how often to report,
 * and a Report of where the Connection stands and its Connection Key. What a
 * Report's answer means for the login is Identity's own: below it, an answer
 * is only the Releases to run, or nothing.
 */

export class Cloud extends Context.Service<
  Cloud,
  {
    /** How long between Heartbeats. */
    readonly every: Duration.Input;
    /** Reports where the tunnel stands and the Connection Key: the Release of each Plugin to run, or null when the Report was not taken. */
    readonly report: (
      status: ConnectionStatus,
      key: string,
    ) => Effect.Effect<Readonly<Record<string, Release>> | null>;
  }
>()('@kestack/connect/Cloud') {}
