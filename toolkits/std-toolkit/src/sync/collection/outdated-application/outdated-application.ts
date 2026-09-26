import { Effect } from 'effect';
import { findOutdatedVersion } from '../../../core/index.js';
import type { CollectionName } from '../../domain/identity/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';

// Once any path meets an Entity newer than this code knows, the Collection is
// outdated for this tab until reload: reported once, never retried.
export const makeOutdatedApplication = <R>(args: {
  collectionName: CollectionName;
  report: SyncReporter<R>;
  runner: EffectRunner<R>;
}) => {
  let reported = false;
  const check = (cause: unknown): Effect.Effect<boolean> => {
    const outdated = findOutdatedVersion(cause);
    if (outdated === undefined) return Effect.succeed(false);
    if (reported) return Effect.succeed(true);
    reported = true;
    return args.runner
      .provide(
        args.report({
          _tag: 'OutdatedApplication',
          collection: args.collectionName,
          version: outdated.version,
          latestVersion: outdated.latestVersion,
        }),
      )
      .pipe(Effect.as(true));
  };
  const ignore = <E>(effect: Effect.Effect<void, E>): Effect.Effect<void, E> =>
    effect.pipe(
      Effect.catch((error) =>
        Effect.flatMap(check(error), (outdated) =>
          outdated ? Effect.void : Effect.fail(error),
        ),
      ),
    );
  return { check, ignore };
};
