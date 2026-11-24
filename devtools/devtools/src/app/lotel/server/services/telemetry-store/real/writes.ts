import { Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { NewLogRecord } from '../../../rpc/telemetry/contract/index.js';

/*
 * A Log Record has no identity of its own, so each one kept gets a Log
 * Record ID, and two identical ones stay two.
 */

/** Each Log Record under a Log Record ID of its own. */
export const identifyLogs = (records: ReadonlyArray<NewLogRecord>) =>
  Effect.forEach(records, (record) =>
    Effect.map(nextUlid, (id) => ({ ...record, id })),
  );
