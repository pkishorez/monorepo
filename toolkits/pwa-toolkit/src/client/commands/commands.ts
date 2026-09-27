import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import {
  type CommandReply,
  type CommandType,
  makeCommand,
  matchCommandReply,
} from '../../shared/commands/index.js';

/** A worker that does not know `type` never replies, so every request times out. */
const REPLY_TIMEOUT = '3 seconds';

/** Sends one command to `worker`; none on timeout or an unreadable reply. */
export const sendCommand = (
  worker: ServiceWorker,
  type: CommandType,
): Effect.Effect<Option.Option<CommandReply>> =>
  Effect.callback<Option.Option<CommandReply>>((resume) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent) =>
      resume(Effect.succeed(matchCommandReply(event.data)));
    try {
      worker.postMessage(makeCommand(type), [channel.port2]);
    } catch {
      resume(Effect.succeed(Option.none()));
    }
    return Effect.sync(() => channel.port1.close());
  }).pipe(Effect.timeoutOption(REPLY_TIMEOUT), Effect.map(Option.flatten));
