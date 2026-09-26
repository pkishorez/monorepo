import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { BuildId } from '../../domain/build/index.js';

/**
 * Worker RPC's own envelope, distinct from the Control Channel key so each
 * listener ignores the other's traffic. Every envelope names its sender's
 * Build ID and the Tab Client connection it belongs to.
 *
 * A connection opens with CONNECT, answered by READY or VERSION_SKEW. A
 * worker that does not know the connection (it was stopped and started
 * again) answers UNKNOWN_CONNECTION, and the tab opens a new one.
 */
export const RPC_ENVELOPE_KEY = '__pwaToolkitRpc';
const Envelope = {
  [RPC_ENVELOPE_KEY]: Schema.Literal(1),
  buildId: BuildId,
  connectionId: Schema.String,
} as const;

/** Tab Client → Worker Server, via `navigator.serviceWorker.controller.postMessage`. */
export const TabEnvelope = Schema.Union([
  Schema.Struct({
    ...Envelope,
    type: Schema.Literals(['CONNECT', 'CLOSE', 'PING']),
  }),
  Schema.Struct({
    ...Envelope,
    type: Schema.Literal('MESSAGE'),
    message: Schema.Unknown,
  }),
]);
export type TabEnvelope = typeof TabEnvelope.Type;

/** Worker Server → Tab Client, via the tab's `Client.postMessage`. */
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

/** A tab and its worker belong to different Build IDs. Transient, never supported. */
export class VersionSkew extends Schema.TaggedError<VersionSkew>()(
  'VersionSkew',
  { tabBuildId: BuildId, workerBuildId: BuildId },
) {}

const decodeTab = Schema.decodeUnknownOption(TabEnvelope);
const decodeWorker = Schema.decodeUnknownOption(WorkerEnvelope);
const hasKey = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && RPC_ENVELOPE_KEY in data;

export const matchTabEnvelope = (data: unknown): Option.Option<TabEnvelope> =>
  hasKey(data) ? decodeTab(data) : Option.none();

export const matchWorkerEnvelope = (
  data: unknown,
): Option.Option<WorkerEnvelope> =>
  hasKey(data) ? decodeWorker(data) : Option.none();

/** None when both sides run one Build ID. */
export const checkVersionSkew = (
  tabBuildId: BuildId,
  workerBuildId: BuildId,
): Option.Option<VersionSkew> =>
  tabBuildId === workerBuildId
    ? Option.none()
    : Option.some(new VersionSkew({ tabBuildId, workerBuildId }));

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
    /** A message from Tab Client to Worker Server. */
    request(message: unknown): void {
      const m = tagged(message);
      if (m?._tag === 'Request') open.add(String(m.id));
      else if (m?._tag === 'Interrupt') close(String(m.requestId));
    },
    /** A message from Worker Server to Tab Client. */
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
