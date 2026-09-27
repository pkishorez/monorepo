import * as Effect from 'effect/Effect';
import type { BuildId } from '../../shared/build/index.js';
import {
  type ControlReply,
  type ControlRequest,
  controlReply,
} from '../../shared/commands/index.js';
import { attempt, GlobalScope } from '../global-scope/index.js';
import { clearRuntimeCaches } from '../requests/strategies/index.js';

/**
 * Answers one Control Channel request on the port the tab transferred with
 * it. A request without a port gets no reply (the tab times out).
 */
export const serveControlRequest = (
  buildId: BuildId,
  request: ControlRequest,
  event: ExtendableMessageEvent,
): Effect.Effect<void, never, GlobalScope> =>
  Effect.gen(function* () {
    const port = event.ports[0];
    if (port === undefined) return;
    const reply = yield* answer(buildId, request).pipe(
      Effect.catch((error) =>
        Effect.succeed(controlReply.failed(error.message)),
      ),
    );
    port.postMessage(reply);
  });

const answer = (
  buildId: BuildId,
  request: ControlRequest,
): Effect.Effect<ControlReply, Error, GlobalScope> => {
  switch (request.type) {
    case 'GET_BUILD_ID':
      return Effect.succeed(controlReply.buildId(buildId));
    case 'SKIP_WAITING':
      return Effect.flatMap(GlobalScope, (scope) =>
        attempt(() => scope.skipWaiting()),
      ).pipe(Effect.as(controlReply.done()));
    case 'CLEAR_RUNTIME_CACHE':
      return Effect.as(clearRuntimeCaches, controlReply.done());
  }
};
