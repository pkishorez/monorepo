import { Effect, Layer, Queue, Stream } from 'effect';
import { groupJournals, type Entry } from '../journal/index.js';
import {
  FlowTelemetry,
  makeSinkBase,
  type MemoryFlowTelemetry,
} from './telemetry.js';

export interface MemoryFlowTelemetryOptions {
  /**
   * How many Entries to keep across every Flow before the oldest are dropped.
   *
   * @default 5000
   */
  readonly maxEntries?: number | undefined;
  readonly origin?: string | undefined;
}

const DEFAULT_MAX_ENTRIES = 5_000;

/** Builds one memory sink. Prefer {@link layerMemory}; this is for hosts that hold the sink themselves. */
export const makeMemoryFlowTelemetry = (
  options: MemoryFlowTelemetryOptions = {},
): MemoryFlowTelemetry => {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new RangeError('maxEntries must be a positive integer');
  }
  let entries: Entry[] = [];
  const listeners = new Set<(entry: Entry) => void>();

  const changes = Stream.callback<Entry>((queue) =>
    Effect.gen(function* () {
      const listener = (entry: Entry) => {
        Queue.offerUnsafe(queue, entry);
      };
      listeners.add(listener);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          listeners.delete(listener);
        }),
      );
    }),
  );

  return {
    kind: 'memory',
    ...makeSinkBase(options.origin),
    write: (entry) => {
      entries.push(entry);
      if (entries.length > maxEntries) {
        entries = entries.slice(entries.length - maxEntries);
      }
      for (const listener of listeners) listener(entry);
    },
    journal: (flowId) => groupJournals(entries).get(flowId) ?? null,
    journals: () => [...groupJournals(entries).values()],
    changes,
    clear: () => {
      entries = [];
    },
  };
};

/** Records every Flow in the runtime to memory. */
export const layerMemory = (options: MemoryFlowTelemetryOptions = {}) =>
  Layer.succeed(FlowTelemetry, makeMemoryFlowTelemetry(options));
