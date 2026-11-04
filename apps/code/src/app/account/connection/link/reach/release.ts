import { Effect, Schema } from 'effect';
import type {
  Connection as ConnectionSchema,
  PluginMismatch,
} from '@kestack/connect/cloud';
import { Command } from '@kestack/kabuki';
import { OnOutdated } from '@kestack/std-toolkit/replica';

type Connection = typeof ConnectionSchema.Type;

/*
 * Which Release of the code Plugin this Code calls, and what it means when
 * a Connection runs another (ADR 0006 in @kestack/connect). Code is built
 * with one Release, `PLUGIN_CODE`, and dials it by its hash. A Connection
 * running another closes the socket at once with `PLUGIN_MISMATCH`; what
 * Cloud Connect names latest, the Connection's `wanted`, says which side
 * is behind:
 *
 * - Updating  Cloud Connect wants this Code's Release, or names none: the
 *             Connection is moving to it. The Link keeps relinking, as it
 *             does, until a socket is answered, and the app says the
 *             Connection is Updating.
 * - Stale     Cloud Connect wants another: this Code is the older side. It
 *             moves to its newest build (`toNewest`), as it does when it
 *             reads anything newer than it knows.
 */

/** The sha256 of the code Plugin's Release this Code was built with, and calls. */
export const PLUGIN_CODE: string = import.meta.env.PLUGIN_CODE;

/** The Plugin Code talks to. */
const CODE = 'code';

/** What a Connection's `PLUGIN_MISMATCH` says of who is behind: the Connection (Updating) or this Code (Stale). */
export type Behind = 'Updating' | 'Stale';

/** Who is behind once the Connection, as listed, closed a socket to `release` with a mismatch. */
export const behindOf = (
  connection: Connection | null,
  release: string = PLUGIN_CODE,
): Behind => {
  const wanted = connection?.wanted[CODE]?.hash;
  return wanted === undefined || wanted === release ? 'Updating' : 'Stale';
};

/** Who is behind on each listed Connection that closed its socket with a mismatch, by its id. */
export const behindAll = (
  connections: ReadonlyArray<Connection> | null,
  mismatched: Readonly<Record<string, PluginMismatch>>,
  release: string = PLUGIN_CODE,
): Readonly<Record<string, Behind>> =>
  Object.fromEntries(
    Object.keys(mismatched).map((id) => [
      id,
      behindOf(connections?.find((each) => each.id === id) ?? null, release),
    ]),
  );

/** This Code is Stale: it moves to its newest build, as the app's `OnOutdated` does. */
export const toNewest = Command.make('MoveToNewestBuild', {
  args: Schema.Struct({}),
  run: () => Effect.flatMap(Effect.service(OnOutdated), (tell) => tell),
});
