import { hostname } from 'node:os';
import { Effect } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import { Db } from '../../../services/db/index.js';

export const ensureMachineId = Effect.gen(function* () {
  const db = yield* Db;
  const { items } = yield* db.machine.query(
    'all',
    { pk: {}, '>': null },
    { limit: 1 },
  );
  const existing = items[0];
  if (existing) return existing.value.machineId;
  const machineId = yield* nextUlid;
  yield* db.machine.insert({ machineId, name: null, hostname: hostname() });
  return machineId;
});
