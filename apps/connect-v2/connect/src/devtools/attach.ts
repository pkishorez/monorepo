import { Effect, type Scope } from 'effect';
import type { FakeWorld } from '@kestack/kabuki/fake';
import type { AppRuntime } from '@kestack/kabuki/react/types';

export interface DevtoolsOptions {
  readonly url: string;
  readonly environment: string;
  readonly name?: string;
  readonly world?: FakeWorld;
}

export const attach = (
  app: AppRuntime,
  options: DevtoolsOptions,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.promise(() => import('@kestack/devtools-kabuki/app')).pipe(
      Effect.map(({ connect }) =>
        connect({
          url: options.url,
          environment: options.environment,
          ...(options.name === undefined ? {} : { name: options.name }),
          ...(options.world === undefined ? {} : { world: options.world }),
        })(app),
      ),
    ),
    (stop) => Effect.sync(stop),
  ).pipe(Effect.asVoid);
