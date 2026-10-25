import { Effect } from 'effect';
import type {
  ForkInput,
  HarnessBinaries,
  HarnessError,
} from '../../contract/index.js';
import { start } from '../app-server/index.js';

/**
 * A new, kept Codex thread with the history up to and including the Fork
 * Point's turn (every turn when none is named), forked on its own
 * `codex app-server` so a running session is never disturbed.
 */
export const fork = (
  input: ForkInput,
): Effect.Effect<
  { readonly nativeId: string },
  HarnessError,
  HarnessBinaries
> =>
  Effect.gen(function* () {
    const server = yield* start(input.cwd);
    const { thread } = yield* server.request('thread/fork', {
      threadId: input.nativeId,
      ...(input.at === undefined ? {} : { lastTurnId: input.at }),
      cwd: input.cwd,
      ephemeral: false,
      excludeTurns: true,
    });
    return { nativeId: thread.id };
  }).pipe(Effect.scoped);

export { ask } from './ask.js';
