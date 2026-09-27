import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { BuildId } from '../../shared/build/index.js';

/**
 * Worker RPC's own envelope, distinct from the command key so each
 * listener ignores the other's traffic. Every envelope names its sender's
 * Build ID and the Worker Client connection it belongs to.
 *
 * A connection opens with CONNECT, answered by READY or VERSION_SKEW. A
 * worker that does not know the connection (it was stopped and started
 * again) adopts it when the message is a new Request and the page has no
 * other call open (`open: 0`), since nothing was lost; otherwise it answers
 * UNKNOWN_CONNECTION, and the page opens a new one.
 */
export const RPC_ENVELOPE_KEY = '__pwaToolkitRpc';
const Envelope = {
  [RPC_ENVELOPE_KEY]: Schema.Literal(1),
  buildId: BuildId,
  connectionId: Schema.String,
} as const;

/** Worker Client → Worker Server, via `navigator.serviceWorker.controller.postMessage`. */
export const ClientEnvelope = Schema.Union([
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(['CONNECT', 'CLOSE', 'PING']),
  }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal('MESSAGE'),
    message: Schema.Unknown,
    /** Calls the page had open on this connection before this message. */
    open: Schema.Number,
  }),
]);
export type ClientEnvelope = typeof ClientEnvelope.Type;

/** Worker Server → Worker Client, via the page's `Client.postMessage`. */
export const WorkerEnvelope = Schema.Union([
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(['READY', 'VERSION_SKEW', 'UNKNOWN_CONNECTION']),
  }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal('MESSAGE'),
    message: Schema.Unknown,
  }),
]);
export type WorkerEnvelope = typeof WorkerEnvelope.Type;

/** A page and its worker belong to different Build IDs. Transient, never supported. */
export class VersionSkew extends Schema.TaggedError<VersionSkew>()(
  'VersionSkew',
  { pageBuildId: BuildId, workerBuildId: BuildId },
) {}

const decodeClient = Schema.decodeUnknownOption(ClientEnvelope);
const decodeWorker = Schema.decodeUnknownOption(WorkerEnvelope);
const hasKey = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && RPC_ENVELOPE_KEY in data;

export const matchClientEnvelope = (
  data: unknown,
): Option.Option<ClientEnvelope> =>
  hasKey(data) ? decodeClient(data) : Option.none();

export const matchWorkerEnvelope = (
  data: unknown,
): Option.Option<WorkerEnvelope> =>
  hasKey(data) ? decodeWorker(data) : Option.none();

/** None when both sides run one Build ID. */
export const checkVersionSkew = (
  pageBuildId: BuildId,
  workerBuildId: BuildId,
): Option.Option<VersionSkew> =>
  pageBuildId === workerBuildId
    ? Option.none()
    : Option.some(new VersionSkew({ pageBuildId, workerBuildId }));

/** Whether an encoded RPC message opens a new call. */
export const isRequest = (message: unknown): boolean =>
  typeof message === 'object' &&
  message !== null &&
  (message as { _tag?: unknown })._tag === 'Request';

/**
 * Counts RPC calls in flight on one side of the wire, from the encoded RPC
 * messages passing through: a Request opens a call, its Exit or Interrupt
 * closes it, a Defect closes all. `idle` fires on each return to zero.
 */
export const makeInFlight = (idle: () => void = () => {}) => {
  const open = new Set<unknown>();
  const close = (id: unknown) => {
    if (open.delete(id) && open.size === 0) idle();
  };
  const tagged = (message: unknown): Record<string, unknown> | undefined =>
    typeof message === 'object' && message !== null
      ? (message as Record<string, unknown>)
      : undefined;
  return {
    get size() {
      return open.size;
    },
    /** A message from Worker Client to Worker Server. */
    request(message: unknown): void {
      const m = tagged(message);
      if (m?._tag === 'Request') open.add(String(m.id));
      else if (m?._tag === 'Interrupt') close(String(m.requestId));
    },
    /** A message from Worker Server to Worker Client. */
    response(message: unknown): void {
      const m = tagged(message);
      if (m?._tag === 'Exit') close(String(m.requestId));
      else if (m?._tag === 'Defect') this.clear();
    },
    clear(): void {
      if (open.size === 0) return;
      open.clear();
      idle();
    },
  };
};
