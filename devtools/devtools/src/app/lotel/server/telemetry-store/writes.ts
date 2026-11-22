import { Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { NewLogRecord, NewSpanRecord } from '../../contract/index.js';
import { TelemetryStore } from './telemetry-store.js';

/*
 * The two writes both doors make, OTLP ingestion and the RPC alike: Span
 * Records are kept by their identity, so a completed Span replaces its
 * Provisional Span Record; each Log Record gets its own Log Record ID, so
 * two identical ones stay two.
 */

/** Keeps Span Records, replacing any with the same trace ID and span ID. */
export const saveSpans = (records: ReadonlyArray<NewSpanRecord>) =>
  Effect.flatMap(TelemetryStore, (store) => store.saveSpans(records));

/** Keeps Log Records, each under a Log Record ID of its own. */
export const insertLogs = (records: ReadonlyArray<NewLogRecord>) =>
  Effect.gen(function* () {
    const store = yield* TelemetryStore;
    const identified = yield* Effect.forEach(records, (record) =>
      Effect.map(nextUlid, (id) => ({ ...record, id })),
    );
    return yield* store.insertLogs(identified);
  });
