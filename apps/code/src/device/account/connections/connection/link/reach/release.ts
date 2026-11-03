import { Effect, Schema } from 'effect';
import { CloudClient, ReleaseStanding } from '@kestack/connect/cloud';
import { Command } from '@kestack/kabuki';
import { OnOutdated } from '@kestack/std-toolkit/replica';

/*
 * Which Release of the code Plugin this Code calls, and what it means when
 * a Connection serves another (ADR 0006 in @kestack/connect). Code is
 * built with one Release, `PLUGIN_CODE`, and dials it by its hash. A
 * Connection serving another closes the socket at once with
 * `PLUGIN_MISMATCH`. Hashes have no order, so only Cloud Connect can say
 * who is behind: each time, it is asked afresh where `PLUGIN_CODE` stands,
 * its Release Standing (`askStanding`), and nothing kept is read for it.
 *
 * - Latest   the Connection is behind, and Updating to this Code's Release.
 * - Older    this Code is behind, Stale: it moves to its newest build
 *            (`toNewest`), as it does when it reads anything newer than it
 *            knows.
 * - Unknown  Cloud Connect is behind: it has never heard of this Code's
 *            Release, so its deploy is pending, or failed. So is a Cloud
 *            Connect too old to answer at all.
 *
 * Cloud Connect out of reach says nothing: `askStanding` answers null.
 */

/** The sha256 of the code Plugin's Release this Code was built with, and calls. */
export const PLUGIN_CODE: string = import.meta.env.PLUGIN_CODE;

/** The Plugin Code talks to. */
const CODE = 'code';

/** Where this Code's Release stands, as Cloud Connect answers it. */
export const CodeStanding = Schema.Literals(['Latest', 'Older', 'Unknown']);
export type CodeStanding = typeof CodeStanding.Type;

/** Who is behind, once a Connection closed a socket with a mismatch: the Connection, this Code, or Cloud Connect. */
export type Behind = 'Connection' | 'Code' | 'Cloud';

/** Who is behind when Cloud Connect says this Code's Release stands at `standing`. */
export const behindAt = (standing: CodeStanding): Behind =>
  standing === 'Latest'
    ? 'Connection'
    : standing === 'Older'
      ? 'Code'
      : 'Cloud';

/** Who is behind on each Connection that mismatched and Cloud Connect answered for, by its id. */
export const behindEach = (
  mismatched: Readonly<
    Record<string, { readonly standing: CodeStanding | null }>
  >,
): Readonly<Record<string, Behind>> =>
  Object.fromEntries(
    Object.entries(mismatched).flatMap(([id, { standing }]) =>
      standing === null ? [] : [[id, behindAt(standing)]],
    ),
  );

/**
 * Where Cloud Connect says the Release `release` of the code Plugin stands
 * now; null when it could not be asked. A Cloud Connect too old to have the
 * call is behind (`Unknown`); an answer too new for this Code to read
 * means this Code is (`Older`).
 */
export const askStanding = (
  release: string = PLUGIN_CODE,
): Effect.Effect<CodeStanding | null, never, CloudClient> =>
  CloudClient.use((cloud) =>
    cloud.Standing({ plugin: CODE, hash: release }),
  ).pipe(
    Effect.map(({ _tag }: ReleaseStanding): CodeStanding | null => _tag),
    Effect.catch((error) =>
      Effect.succeed<CodeStanding | null>(
        error._tag === 'VersionGap'
          ? error.older === 'server'
            ? 'Unknown'
            : 'Older'
          : null,
      ),
    ),
    // A defect says nothing either: answered null, the Link relinks slowly
    // rather than staying held with no answer.
    Effect.catchDefect(() => Effect.succeed<CodeStanding | null>(null)),
  );

/** This Code is Stale: it moves to its newest build, as the app's `OnOutdated` does. */
export const toNewest = Command.make('MoveToNewestBuild', {
  args: Schema.Struct({}),
  run: () => Effect.flatMap(Effect.service(OnOutdated), (tell) => tell),
});
