import { Context, Stream } from 'effect';
import type { Entry, Journal } from '../journal/index.js';

/** What every Flow Telemetry sink offers to the Participant writers. */
interface SinkBase {
  /** The optional identity of this process; stamped on every Entry. */
  readonly origin: string | undefined;
  /** Mints an id unique within this sink's lifetime: Entry, Activation, Message. */
  readonly nextId: () => string;
  /** The order this process records Entries in. */
  readonly nextSequence: () => number;
  readonly write: (entry: Entry) => void;
}

/** The default: Entries are discarded. */
export interface NoneFlowTelemetry extends SinkBase {
  readonly kind: 'none';
}

/** Keeps the latest Entries in memory; for tests, Stories, and in-app panels. */
export interface MemoryFlowTelemetry extends SinkBase {
  readonly kind: 'memory';
  readonly journal: (flowId: string) => Journal | null;
  readonly journals: () => readonly Journal[];
  /** Every Entry written after subscription, in write order. */
  readonly changes: Stream.Stream<Entry>;
  readonly clear: () => void;
}

/** Forwards Entries to a Flow Store over RPC. */
export interface RemoteFlowTelemetry extends SinkBase {
  readonly kind: 'remote';
  readonly endpoint: string;
}

export type FlowTelemetryService =
  | NoneFlowTelemetry
  | MemoryFlowTelemetry
  | RemoteFlowTelemetry;

const randomPrefix = () =>
  Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0');

/** Shared id and sequence minting for every sink kind. */
export const makeSinkBase = (origin: string | undefined) => {
  const prefix = randomPrefix();
  let ids = 0;
  let sequence = 0;
  return {
    origin,
    nextId: () => `${prefix}-${(ids += 1).toString(36)}`,
    nextSequence: () => (sequence += 1),
  };
};

const makeNone = (): NoneFlowTelemetry => ({
  kind: 'none',
  ...makeSinkBase(undefined),
  write: () => undefined,
});

/**
 * The sink a running process writes its Entries into. Optional: without a
 * Layer every Flow in the runtime records nothing, the same way an Effect
 * program traces nothing until a Tracer is provided.
 */
export const FlowTelemetry = Context.Reference<FlowTelemetryService>(
  'flow/FlowTelemetry',
  { defaultValue: makeNone },
);
