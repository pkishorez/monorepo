import { Context, type Effect, Layer, Stream } from 'effect';
import type {
  Harnesses,
  HarnessHost,
  Models,
  OneShotPrompt,
} from '@kestack/ai-toolkit/harness';
import type { Speech } from '@kestack/ai-toolkit/speech';
import type { CloudClient } from '../../cloud/client/index.js';
import type { ConnectionStatus } from '../../contracts/heartbeat/index.js';
import type { CodeClients } from '../../connection/plugins/code/api/index.js';
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
 *                  when a computer's `ke-connect` stops on its own and how
 *                  many sockets its tunnel holds, and given, once Connect
 *                  runs, how another device reaches it.
 * - `ConnectCloud` what Connect Cloud is deployed with now: whether it is
 *                  in reach, its Minimum Connect, and the code Plugin
 *                  Release it names.
 * - `AgentEdges`   what every computer's code Plugin shares: the Agent's
 *                  and Speech's edges, which come from their own fakes,
 *                  never from a computer.
 *
 * A computer's tunnel is at an address under `.computers.fake`
 * (`tunnelOf`), which only this tab's sockets reach.
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
  /**
   * Its `ke-connect` was removed (`ke-connect remove`): it asks Connect
   * Cloud to forget it, as soon as it is online, and runs no more.
   */
  readonly removed: boolean;
  /** When its `ke-connect` last started: another value is a restart, which starts its Heartbeat and code Plugin again. */
  readonly startedAt: number;
  /** Its Connection Key now: a socket offering any other is closed `KEY_EXPIRED`. */
  readonly key: string;
  /** How its tunnel stands, as its Reports say; a socket reaches it only while it is Ready, and not Unreachable, at the address it dials. */
  readonly status: ConnectionStatus;
  /** The code Plugin Release it runs in place of the one Connect Cloud names; null to run that one, as `ke-connect` does. */
  readonly release: string | null;
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

/**
 * How another device of the signed-in User reaches Connect in the tab: as
 * an App reaches it, Connect Cloud's client, and each Connection's code
 * Plugin at the App's own Release, at the address Connect Cloud lists.
 */
export interface AnotherDevice {
  readonly cloud: CloudClient['Service'];
  readonly code: CodeClients['Service'];
}

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
    /** Told how many sockets reach a computer's tunnel, each time the number changes. */
    readonly sockets: (id: string, open: number) => Effect.Effect<void>;
    /** Given once Connect in the tab runs, for as long as it runs: how another device reaches it. */
    readonly anotherDevice: (device: AnotherDevice) => Effect.Effect<void>;
  }
>()('@kestack/connect/Computers') {}

/**
 * The code Plugin Release Connect Cloud names, as an App sees it:
 *
 * - `TheApps`: the App's own, the one `inTab` is given as `wanted`.
 * - `Newer`: another, newer than the App's: Connect Cloud keeps the App's
 *   file, so the App's Release stands Older.
 * - `Older`: another, older than the App's: Connect Cloud has never heard
 *   of the App's, so it stands Unknown.
 */
export type CloudRelease = 'TheApps' | 'Newer' | 'Older';

/** Connect Cloud's own outside conditions, now. */
export interface CloudConditions {
  /** Whether it answers: out of reach, every call fails as a request that never got there. */
  readonly reachable: boolean;
  /** Its Minimum Connect; null for the one `inTab` is given. */
  readonly minConnect: string | null;
  /** The code Plugin Release it names. */
  readonly release: CloudRelease;
}

/** Connect Cloud as it is deployed: in reach, with what `inTab` is given. */
export const DEPLOYED: CloudConditions = {
  reachable: true,
  minConnect: null,
  release: 'TheApps',
};

/** What Connect Cloud is deployed with now, and whether it is in reach. */
export class ConnectCloud extends Context.Service<
  ConnectCloud,
  {
    /** Its conditions now, then again on each change. */
    readonly changes: Stream.Stream<CloudConditions>;
  }
>()('@kestack/connect/ConnectCloud') {
  /** Connect Cloud as deployed, for good. */
  static readonly deployed: Layer.Layer<ConnectCloud> = Layer.succeed(
    ConnectCloud,
    { changes: Stream.make(DEPLOYED) },
  );
}

/**
 * The code Plugin Release a computer runs, or Connect Cloud names, in a tab
 * when it is not the App's own: one no App is built with.
 */
export const ANOTHER_RELEASE = '0'.repeat(63) + '1';

/** The suffix of every tunnel address in a tab: no other socket reaches one. */
export const TUNNELS = '.computers.fake';

/** A computer's tunnel address in a tab, by a name of it, such as its Connection id. */
export const tunnelOf = (name: string) => `https://${name}${TUNNELS}`;
