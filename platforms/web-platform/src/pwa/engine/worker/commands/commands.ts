import * as Effect from 'effect/Effect';
import { type Command, commandReply } from '../../shared/commands/index.js';
import { attempt, GlobalScope } from '../global-scope/index.js';

/**
 * Answers one command on the port the client transferred with it. A command
 * without a port gets no reply (the client times out).
 */
export const serveCommand = (
  command: Command,
  event: ExtendableMessageEvent,
): Effect.Effect<void, never, GlobalScope> =>
  Effect.gen(function* () {
    const port = event.ports[0];
    if (port === undefined) return;
    const reply = yield* answer(command).pipe(
      Effect.catch((error) =>
        Effect.succeed(commandReply.failed(error.message)),
      ),
    );
    port.postMessage(reply);
  });

const answer = (command: Command) => {
  switch (command.type) {
    case 'SKIP_WAITING':
      return Effect.flatMap(GlobalScope, (scope) =>
        attempt(() => scope.skipWaiting()),
      ).pipe(Effect.as(commandReply.done()));
  }
};
