import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import {
  type ControlReply,
  type ControlRequestType,
  makeControlRequest,
  matchControlReply,
} from '../domain/control-channel/index.js';

/** A worker that does not know `type` never replies, so every request times out. */
const REPLY_TIMEOUT = '3 seconds';

/** Sends one Control Channel request to `worker`; none on timeout or an unreadable reply. */
export const sendControlRequest = (
  worker: ServiceWorker,
  type: ControlRequestType,
): Effect.Effect<Option.Option<ControlReply>> =>
  Effect.callback<Option.Option<ControlReply>>((resume) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event: MessageEvent) =>
      resume(Effect.succeed(matchControlReply(event.data)));
    try {
      worker.postMessage(makeControlRequest(type), [channel.port2]);
    } catch {
      resume(Effect.succeed(Option.none()));
    }
    return Effect.sync(() => channel.port1.close());
  }).pipe(Effect.timeoutOption(REPLY_TIMEOUT), Effect.map(Option.flatten));
