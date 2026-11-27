import { Effect } from 'effect';
import { nextUlid } from '@kestack/std-toolkit/core';
import type { NewLogRecord } from '../../../rpc/telemetry/contract/index.js';

export const identifyLogs = (records: ReadonlyArray<NewLogRecord>) =>
  Effect.forEach(records, (record) =>
    Effect.map(nextUlid, (id) => ({ ...record, id })),
  );
