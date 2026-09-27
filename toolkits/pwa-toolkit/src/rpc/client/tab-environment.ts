import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import {
  WorkerError,
  WorkerSpawnError,
} from 'effect/unstable/workers/WorkerError';
import { BUILD_ID_META_NAME, BuildId } from '../../shared/build/index.js';

const spawnError = (message: string) =>
  new WorkerError({ reason: new WorkerSpawnError({ message }) });

const decodeBuildId = Schema.decodeUnknownOption(BuildId);

/** The tab's Build ID, from the meta tag `pwaHead()` renders. */
export const tabBuildId: Effect.Effect<BuildId, WorkerError> = Effect.suspend(
  () => {
    const content = globalThis.document
      ?.querySelector<HTMLMetaElement>(`meta[name="${BUILD_ID_META_NAME}"]`)
      ?.getAttribute('content');
    return Option.match(decodeBuildId(content), {
      onSome: Effect.succeed,
      onNone: () =>
        Effect.fail(
          spawnError(
            `Worker RPC needs the Build ID meta tag (${BUILD_ID_META_NAME}); render pwaHead() in the document head`,
          ),
        ),
    });
  },
);

/** `navigator.serviceWorker`, where the browser offers it. */
export const serviceWorkerContainer: Effect.Effect<
  ServiceWorkerContainer,
  WorkerError
> = Effect.suspend(() => {
  const container = globalThis.navigator?.serviceWorker;
  return container === undefined
    ? Effect.fail(
        spawnError(
          'Worker RPC needs service workers (a secure context in a supporting browser)',
        ),
      )
    : Effect.succeed(container);
});
