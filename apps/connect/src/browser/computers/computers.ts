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
 * The outside world Connect in a browser tab (`inTab`) runs against, as
 * the tab sees it. Whatever serves these keys (the Computers fake, a test)
 * decides everything here; Connect in the tab only reads it.
 *
 * - `Computers`    the computers a person has, each running `ke-connect`:
 *                  its Connection id and Computer Name, the User it is
 *                  signed in as, its `ke-connect` version, whether it is
 *                  online, how its tunnel stands, its Connection Key, and
 *                  the edges only it has, its File System and git. Told
 *                  when a computer's `ke-connect` stops on its own.
 * - `AgentEdges`   what every computer's code Plugin shares: the Agent's
 *                  and Speech's edges, which come from their own fakes,
 *                  never from a computer.
 *
 * Connect Cloud always answers, and names the App's own Release, the one
 * `inTab` is given. A computer's tunnel is at an address under
 * `.computers.fake` (`tunnelOf`), which only this tab's sockets reach.
 */

/** What only a computer has, which its code Plugin runs over: its File System, and git on it. */
export type ComputerEdges = FileSystem | Git;

/** What every computer's code Plugin in a tab shares, beside its own edges and Store: the Agent's and Speech's. */
export type AgentEdges =
  | Harnesses
  | OneShotPrompt
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
  /**
   * While it is offline: how long Connect Cloud is to have heard nothing
   * from it, in milliseconds, set once as it goes offline, so its Last Seen
   * is that long ago at once; null leaves it at its last Report.
   */
  readonly silentFor: number | null;
  /** Its Connection Key, which each Report carries. */
  readonly key: string;
  /** How its tunnel stands, as its Reports say; a socket reaches it only while it is Ready, and not Unreachable, at the address it dials. */
  readonly status: ConnectionStatus;
  /** Its File System and git, which its code Plugin runs over each time it starts. */
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
     * stopped until it starts again: offline and back.
     */
    readonly stopped: (id: string, why: Stopped) => Effect.Effect<void>;
  }
>()('@kestack/connect/Computers') {}

/** The suffix of every tunnel address in a tab: no other socket reaches one. */
export const TUNNELS = '.computers.fake';

/** A computer's tunnel address in a tab, by a name of it, such as its Connection id. */
export const tunnelOf = (name: string) => `https://${name}${TUNNELS}`;
