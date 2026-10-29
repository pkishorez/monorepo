import { Effect } from 'effect';
import type {
  OperationFailure,
  StdTableContract,
} from '../../std-table/contract/index.js';
import type { TableSnapshot } from '../../../snapshot/index.js';
import type { CurrentContract, StoredContract } from './capture.js';
import { splitSnapshot, type ContractRows } from './rows.js';
import {
  readContractRows,
  readTableRow,
  writeContract,
  type ContractRead,
} from './store.js';

// The Stored contract (ADR 0021): reserved rows inside the table, read and
// written through the adapter's own StdTable contract.

export {
  captureContract,
  contractFromSnapshot,
  type CurrentContract,
  type StoredContract,
  type TableMode,
} from './capture.js';
export {
  isOutdatedCode,
  SetupRefused,
  type SetupRefusedReason,
} from './refused.js';
export { planContract, type ContractPlan } from './plan.js';
export {
  countContractRows,
  holdsAppRows,
  readMigrationRow,
  readTableRow,
  wipeAppRows,
  wipeRows as wipeTable,
  writeMigrationRow,
} from './store.js';
export { NO_ROWS, type ContractRows, type MigrationRow } from './rows.js';

/** What setup found stored: the same contract, or rows to plan from. */
export type StoredRead =
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'changed';
      readonly storedMode: CurrentContract['record']['mode'] | undefined;
      readonly read: ContractRead;
    };

/**
 * Reads the Stored contract. A table row whose hash and mode match the
 * current contract's is the whole read; otherwise every row is read.
 */
export const readStoredContract = (
  store: StdTableContract,
  current: CurrentContract,
): Effect.Effect<StoredRead, OperationFailure> =>
  Effect.gen(function* () {
    const head = yield* readTableRow(store);
    const row = head.kind === 'read' ? head.row?.value : undefined;
    if (
      row !== undefined &&
      row.hash === current.record.hash &&
      row.mode === current.record.mode
    )
      return { kind: 'unchanged' };
    return {
      kind: 'changed',
      storedMode: row?.mode,
      read: yield* readContractRows(store),
    };
  });

/** Records the current contract, the table row last. */
export const recordContract = (
  store: StdTableContract,
  options: {
    readonly current: CurrentContract;
    readonly stored: ContractRows;
  },
): Effect.Effect<void, OperationFailure> =>
  writeContract(store, {
    snapshot: options.current.snapshot,
    mode: options.current.record.mode,
    hash: options.current.record.hash,
    stored: options.stored,
  });

/**
 * A contract kept outside the table, such as a deploy guard's, as the rows
 * setup plans from, as if committed.
 */
export const rowsOfContract = (
  snapshot: TableSnapshot,
  record: Pick<StoredContract, 'mode' | 'hash'>,
): ContractRows => {
  const rows = splitSnapshot(snapshot, {
    mode: record.mode,
    hash: record.hash,
    generation: 1,
  });
  return { ...rows, table: { value: rows.table, _u: '' } };
};
