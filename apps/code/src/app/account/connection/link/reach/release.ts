import { Effect, Option, Schema } from 'effect';
import { CloudClient, ReleaseStanding } from '@kestack/connect/cloud';
import type { PluginMismatch } from '@kestack/connect/code';
import { Command } from '@kestack/kabuki';
import { OnOutdated } from '@kestack/std-toolkit/replica';

/*
 * Which Release of the code Plugin this Code calls, and what it means when
 * a Connection runs another (ADR 0006 in @kestack/connect). Code is built
 * with one Release, `PLUGIN_CODE`, and dials it by its hash. A Connection
 * running another closes the socket at once with `PLUGIN_MISMATCH`. Hashes
 * have no order, so only Connect Cloud can say who is behind: each such close
 * holds the Link, which waits to dial again, while it is asked afresh where
 * this Code's Release stands (`askStanding`).
 *
 * - Latest   the Connection is moving to this Code's Release: Updating, and
 *            the Link relinks at once.
 * - Older    this Code is the older side: Stale. It moves to its newest build
 *            (`toNewest`), and the Link stays held, as nothing changes until
 *            it loads.
 * - Unknown  Connect Cloud is behind: its deploy is pending, or failed. So is
 *            one too old to answer. The Connection is Updating as far as Code
 *            can say, and the Link relinks after `RELINK_SLOWLY`, to ask again.
 *
 * Connect Cloud out of reach says nothing: `askStanding` answers null, and the
 * Link relinks slowly too. A socket closing any other way asks nothing.
 */

/** The sha256 of the code Plugin's Release this Code was built with, and calls. */
export const PLUGIN_CODE: string = import.meta.env.PLUGIN_CODE;

/** The Plugin Code talks to. */
const CODE = 'code';

/** How long a Link waits to relink once Connect Cloud was behind, or could not be asked. */
export const RELINK_SLOWLY = 30_000;

/** How long Connect Cloud is waited on before it counts as out of reach. */
const ASK_FOR = 10_000;

/** A Connection that closed a socket with a mismatch, and what Connect Cloud said of it. */
export const Mismatch = Schema.Struct({
  /** Where Connect Cloud last said this Code's Release stands; null until it answered. */
  standing: Schema.NullOr(ReleaseStanding.schema),
  /** Whether Connect Cloud is being asked now. */
  asking: Schema.Boolean,
  /** Whether its Link waits to relink. */
  held: Schema.Boolean,
  /** How many times Connect Cloud was asked: what names each ask. */
  asks: Schema.Finite,
});
export type Mismatch = typeof Mismatch.Type;

const isOlder = (mismatch: Mismatch | null) =>
  mismatch?.standing?._tag === 'Older';

/** What `was` becomes as its socket says `close`: a mismatch asks anew, unless it is asking, and anything else ends it, unless this Code is Stale. */
export const mismatchTold = (
  was: Mismatch | null,
  close: PluginMismatch | null,
): Mismatch | null => {
  if (isOlder(was)) return was;
  if (close === null) return null;
  if (was?.asking === true) return was;
  return {
    standing: was?.standing ?? null,
    asking: true,
    held: true,
    asks: (was?.asks ?? 0) + 1,
  };
};

/** What `was` becomes as Connect Cloud answers its ask `asks`; an answer to an earlier one says nothing. */
export const standingAnswered = (
  was: Mismatch | null,
  asks: number,
  standing: ReleaseStanding | null,
): Mismatch | null =>
  was?.asks !== asks
    ? was
    : {
        ...was,
        standing: standing ?? was.standing,
        asking: false,
        held: standing?._tag !== 'Latest',
      };

/** What `was` becomes once the wait after its ask `asks` is over. */
export const relinkDue = (
  was: Mismatch | null,
  asks: number,
): Mismatch | null => (was?.asks !== asks ? was : { ...was, held: false });

/** Whether its Link waits out `RELINK_SLOWLY`: held, answered, and this Code not Stale. */
export const relinksSlowly = (mismatch: Mismatch | null) =>
  mismatch !== null && mismatch.held && !mismatch.asking && !isOlder(mismatch);

/** Who is behind when Connect Cloud says this Code's Release stands at `standing`: the Connection or Connect Cloud (Updating), or this Code (Stale). */
export type Behind = 'Updating' | 'Stale';

const behindOf = ({ _tag }: ReleaseStanding): Behind =>
  _tag === 'Older' ? 'Stale' : 'Updating';

/** Who is behind on each Connection Connect Cloud answered for, by its id. */
export const behindAll = (
  said: Readonly<Record<string, { readonly standing: ReleaseStanding | null }>>,
): Readonly<Record<string, Behind>> =>
  Object.fromEntries(
    Object.entries(said).flatMap(([id, { standing }]) =>
      standing === null ? [] : [[id, behindOf(standing)]],
    ),
  );

/**
 * Where Connect Cloud says the Release `release` of the code Plugin stands now;
 * null when it could not be asked. One too old to have the call is behind
 * (`Unknown`); an answer too new for this Code to read means this Code is
 * (`Older`). A call that never ends says nothing too, or its Link would stay
 * held for good.
 */
export const askStanding = (
  release: string = PLUGIN_CODE,
): Effect.Effect<ReleaseStanding | null, never, CloudClient> =>
  CloudClient.use((cloud) =>
    cloud.Standing({ plugin: CODE, hash: release }),
  ).pipe(
    Effect.timeoutOption(ASK_FOR),
    Effect.map(Option.getOrNull),
    Effect.catch((error) =>
      Effect.succeed<ReleaseStanding | null>(
        error._tag === 'VersionGap'
          ? { _tag: error.older === 'server' ? 'Unknown' : 'Older' }
          : null,
      ),
    ),
    // A defect says nothing either: a Link must never stay held with no answer.
    Effect.catchDefect(() => Effect.succeed<ReleaseStanding | null>(null)),
  );

/** This Code is Stale: it moves to its newest build, as the app's `OnOutdated` does. */
export const toNewest = Command.make('MoveToNewestBuild', {
  args: Schema.Struct({}),
  run: () => Effect.flatMap(Effect.service(OnOutdated), (tell) => tell),
});
