import type { Effect } from 'effect';
import type {
  SnapshotChange,
  SnapshotDecodeError,
  TableSnapshot as TableSnapshotDocument,
} from './document/index.js';
import {
  captureTableSnapshot,
  type TableSource,
} from './capture/table-capture/index.js';
import { parseTableSnapshot, serializeTableSnapshot } from './codec/index.js';
import { diffTableSnapshot } from './compare/snapshot-diff/index.js';
import {
  changeLabel,
  renderSnapshotChanges,
} from './compare/snapshot-renderer/index.js';

export type TableSnapshot = TableSnapshotDocument;
export type { SnapshotChange, TableSource };
export {
  SnapshotIncompatible,
  TableSnapshotESchema,
} from './document/index.js';

export const TableSnapshot = {
  capture: (table: TableSource): TableSnapshot => captureTableSnapshot(table),
  parse: (input: unknown): Effect.Effect<TableSnapshot, SnapshotDecodeError> =>
    parseTableSnapshot(input),
  serialize: (
    snapshot: TableSnapshot,
  ): Effect.Effect<unknown, SnapshotDecodeError> =>
    serializeTableSnapshot(snapshot),
  diff: (
    previous: TableSnapshot,
    current: TableSnapshot,
  ): readonly SnapshotChange[] => diffTableSnapshot(previous, current),
  renderChanges: (changes: readonly SnapshotChange[]): string =>
    renderSnapshotChanges(changes),
  changeLabel: (change: SnapshotChange): string => changeLabel(change),
} as const;
