import type { Effect } from 'effect';
import type {
  SnapshotChange,
  SnapshotDecodeError,
  TableSnapshot as TableSnapshotDocument,
} from '../domain/index.js';
import {
  captureTableSnapshot,
  type TableSource,
} from '../capture/table-capture/index.js';
import {
  parseTableSnapshot,
  serializeTableSnapshot,
} from './snapshot-decoder/index.js';
import { diffTableSnapshot } from './snapshot-diff/index.js';
import { renderSnapshotChanges } from './snapshot-renderer/index.js';

export type TableSnapshot = TableSnapshotDocument;

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
} as const;
