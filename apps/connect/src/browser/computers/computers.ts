import { Context, type Effect, type Layer, type Stream } from 'effect';
import type {
  Harnesses,
  HarnessHost,
  Models,
  OneShotPrompt,
} from '@kestack/ai-toolkit/harness';
import type { Speech } from '@kestack/ai-toolkit/speech';
import type { ConnectionStatus } from '../../contracts/heartbeat/index.js';
import type {
  FileSystem,
  Git,
} from '../../connection/plugins/code/engine/index.js';

/*
 * The computers a person has, as a browser tab sees them: the outside world
 * Connect in the tab (`inTab`) runs against. Each one is a computer running
 * `ke-connect`: its Connection id and Computer Name, the User it is signed in
 * as, its `ke-connect` version, whether it is online, how its tunnel stands,
 * its Connection Key, and the edges its code Plugin runs over. The tab runs
 * the rest for real: Connect Cloud, each computer's Heartbeat and its code
 * Plugin. Whatever serves this key (the Computers fake, a test) decides
 * everything here; Connect in the tab only reads it, and tells it when a
 * computer's `ke-connect` stops on its own.
 *
 * A computer's tunnel is at an address under `.computers.fake`
 * (`tunnelOf`), which only this tab's sockets reach.
 */

/** What a computer's code Plugin runs over: everything its Engine and handlers need but its Store. */
export type ComputerEdges =
  | Harnesses
  | OneShotPrompt
  | Git
  | FileSystem
  | HarnessHost
  | Models
  | Speech;

/** One computer running `ke-connect`, as it is now. */
export interface Computer {
  /** Its Connection id, kept across restarts. */
  readonly id: string;
  /** Its Computer Name, which each Report carries. */
  readonly name: string;
  /** The email of the User its `ke-connect` is signed in as; only one at kestack.test signs in. */
  readonly email: string;
  /** The `ke-connect` version it runs. */
  readonly version: string;
  /** Whether it is on and running `ke-connect`; one that is not sends nothing, and its sockets drop. */
  readonly online: boolean;
  /** When its `ke-connect` last started: another value is a restart, which starts its Heartbeat and code Plugin again. */
  readonly startedAt: number;
  /** Its Connection Key now: a socket offering any other is closed `KEY_EXPIRED`. */
  readonly key: string;
  /** How its tunnel stands, as its Reports say; a socket reaches it only while it is Ready, and not Unreachable, at the address it dials. */
  readonly status: ConnectionStatus;
  /** The code Plugin Release it runs in place of the one Connect Cloud names; null to run that one, as `ke-connect` does. */
  readonly release: string | null;
  /** The edges its code Plugin runs over, built each time it starts. */
  readonly edges: Layer.Layer<ComputerEdges>;
}

/** Why a computer's `ke-connect` stopped on its own, as it would print it. */
export type Stopped =
  /** Connect Cloud forgot it: it signed out and stopped. */
  | { readonly _tag: 'Forgotten' }
  /** Connect Cloud refused its Sign-in: it stopped until signed in again. */
  | { readonly _tag: 'SignedOut' }
  /** Its `ke-connect` is below the Minimum Connect: it printed `line` and exited. */
  | { readonly _tag: 'Outdated'; readonly line: string }
  /** Another User holds its id. */
  | { readonly _tag: 'Taken' };

/** The computers a person has: the outside world of Connect in a tab. */
export class Computers extends Context.Service<
  Computers,
  {
    /** Every computer now, then all of them again on each change. */
    readonly changes: Stream.Stream<ReadonlyArray<Computer>>;
    /**
     * Told when a computer's `ke-connect` stopped on its own. It stays
     * stopped until it starts again: a new `startedAt`, or offline and back.
     */
    readonly stopped: (id: string, why: Stopped) => Effect.Effect<void>;
  }
>()('@kestack/connect/Computers') {}

/** The suffix of every tunnel address in a tab: no other socket reaches one. */
export const TUNNELS = '.computers.fake';

/** A computer's tunnel address in a tab, by a name of it, such as its Connection id. */
export const tunnelOf = (name: string) => `https://${name}${TUNNELS}`;
