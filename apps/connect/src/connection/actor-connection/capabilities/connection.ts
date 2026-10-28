import { Context, type Effect } from 'effect';
import type { PluginVersion } from '../../../cloud/contract/index.js';

/*
 * How the parts of a running Connection tell it what they learned, without
 * knowing each other: online what Cloud Connect answered and the tunnel's
 * address, plugins the router's port. What one tells, the Connection hands
 * the other as Props.
 */

export class Connection extends Context.Service<
  Connection,
  {
    /** A Request: the router listens on `port`. */
    readonly listening: (port: number) => Effect.Effect<void>;
    /** A Request: Cloud Connect wants these versions of its Plugins run. */
    readonly wanted: (
      versions: Readonly<Record<string, PluginVersion>>,
    ) => Effect.Effect<void>;
    /** A Request: the tunnel's address now; null while there is none. */
    readonly address: (url: string | null) => Effect.Effect<void>;
    /** A Request: Cloud Connect forgot the Connection (ADR 0016). */
    readonly forgotten: Effect.Effect<void>;
    /** A Request: the Connection cannot go on, and why. */
    readonly stop: (reason: string) => Effect.Effect<void>;
  }
>()('@kestack/connect/Connection') {}
