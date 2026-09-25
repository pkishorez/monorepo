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
  restoreESchemaDefinitions,
  type RestoredESchema,
} from '../restore/eschema-restore/index.js';
import { parseTableSnapshot } from './snapshot-decoder/index.js';
import { diffTableSnapshot, isUpgradable } from './snapshot-diff/index.js';
import {
  renderSnapshotChanges,
  renderTableSnapshot,
} from './snapshot-renderer/index.js';

export type TableSnapshot = TableSnapshotDocument;

/**
 * The one door to a table's contract. Capture reads a table definition;
 * everything else works on the captured document alone, so a test, a deploy
 * guard, or an inspection client needs nothing from a running table.
 */
export const TableSnapshot = {
  /** The table's contract as plain data, from its definition and registered entities. */
  capture: (table: TableSource): TableSnapshot => captureTableSnapshot(table),
  /** Reads a stored document, migrating older formats forward and validating its references. */
  parse: (input: unknown): Effect.Effect<TableSnapshot, SnapshotDecodeError> =>
    parseTableSnapshot(input),
  /** Every semantic difference between two documents, each with its own impact. */
  diff: (
    previous: TableSnapshot,
    current: TableSnapshot,
  ): readonly SnapshotChange[] => diffTableSnapshot(previous, current),
  /** True when no change would strand a row already written under `previous`. */
  isUpgradable: (changes: readonly SnapshotChange[]): boolean =>
    isUpgradable(changes),
  /** The document as stable, human-readable text. */
  render: (snapshot: TableSnapshot): string => renderTableSnapshot(snapshot),
  /** A change list as text, grouped by impact. */
  renderChanges: (changes: readonly SnapshotChange[]): string =>
    renderSnapshotChanges(changes),
  /** Live Effect schemas for every ESchema version in the document, nested references resolved. */
  restore: (snapshot: TableSnapshot): readonly RestoredESchema[] =>
    restoreESchemaDefinitions(snapshot.schemas),
} as const;
