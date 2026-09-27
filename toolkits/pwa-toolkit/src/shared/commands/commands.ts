import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { BuildId } from '../build/index.js';

/**
 * FROZEN. Every worker version ever shipped must understand these shapes, so
 * never change or remove a field; add a new `type` instead. A worker ignores
 * a `type` it does not know and sends no reply, so senders must time out.
 */
export const CONTROL_CHANNEL_KEY = '__pwaToolkit';
const Envelope = { [CONTROL_CHANNEL_KEY]: Schema.Literal(1) } as const;

const request = <T extends string>(type: T) =>
  Schema.Struct({ ...Envelope, type: Schema.Literal(type) });

/** Tab → worker, via `worker.postMessage(message, [port])`. */
export const ControlRequest = Schema.Union([
  request('GET_BUILD_ID'),
  request('SKIP_WAITING'),
  request('CLEAR_RUNTIME_CACHE'),
]);
export type ControlRequest = typeof ControlRequest.Type;
export type ControlRequestType = ControlRequest['type'];

/** Worker → tab, posted once on the request's transferred `MessagePort`. */
export const ControlReply = Schema.Union([
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal('BUILD_ID'),
    buildId: BuildId,
  }),
  Schema.Struct({ ...Envelope, type: Schema.Literal('DONE') }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal('FAILED'),
    message: Schema.String,
  }),
]);
export type ControlReply = typeof ControlReply.Type;

export const makeControlRequest = (
  type: ControlRequestType,
): ControlRequest => ({
  [CONTROL_CHANNEL_KEY]: 1,
  type,
});

/** Replies: `GET_BUILD_ID` → `BUILD_ID`; the others → `DONE` or `FAILED`. */
export const controlReply = {
  buildId: (buildId: BuildId): ControlReply => ({
    [CONTROL_CHANNEL_KEY]: 1,
    type: 'BUILD_ID',
    buildId,
  }),
  done: (): ControlReply => ({ [CONTROL_CHANNEL_KEY]: 1, type: 'DONE' }),
  failed: (message: string): ControlReply => ({
    [CONTROL_CHANNEL_KEY]: 1,
    type: 'FAILED',
    message,
  }),
};

/** Whether `data` carries the Control Channel key at all (another listener's message if not). */
export const isControlEnvelope = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && CONTROL_CHANNEL_KEY in data;

const decodeRequest = Schema.decodeUnknownOption(ControlRequest);
const decodeReply = Schema.decodeUnknownOption(ControlReply);

export const matchControlRequest = (
  data: unknown,
): Option.Option<ControlRequest> =>
  isControlEnvelope(data) ? decodeRequest(data) : Option.none();

export const matchControlReply = (
  data: unknown,
): Option.Option<ControlReply> =>
  isControlEnvelope(data) ? decodeReply(data) : Option.none();
