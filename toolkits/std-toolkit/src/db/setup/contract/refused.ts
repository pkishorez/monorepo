import { TableSnapshot, type SnapshotChange } from '../../../snapshot/index.js';

export type SetupRefusedReason =
  | 'breaking'
  | 'mode-change'
  | 'unreadable'
  | 'replaces-table'
  | 'renames-table'
  /** The table holds rows but no Stored contract. */
  | 'no-contract'
  /** A change needs a Backfill that is not declared, or is already done. */
  | 'backfill-missing'
  /** The pending Backfills cannot be put in an order that runs. */
  | 'backfill-order';

/**
 * Setup refused to touch a persistent table. It never wipes: the fix is a
 * code change, or a new physical table name.
 */
export class SetupRefused extends Error {
  readonly _tag = 'SetupRefused';

  constructor(
    readonly table: string,
    readonly reason: SetupRefusedReason,
    readonly changes: readonly SnapshotChange[] = [],
    readonly cause?: unknown,
    readonly detail?: string,
  ) {
    super(refusalMessage(table, reason, changes, detail));
    this.name = 'SetupRefused';
  }
}

const refusalMessage = (
  table: string,
  reason: SetupRefusedReason,
  changes: readonly SnapshotChange[],
  detail: string | undefined,
) => {
  switch (reason) {
    case 'no-contract':
      return `std-toolkit: persistent table "${table}" holds rows but no Stored contract, so nothing says what they were written under. Nothing was changed. Use a new physical table name, or delete the data.`;
    case 'backfill-missing':
      return [
        `std-toolkit: persistent table "${table}" cannot be set up: these changes need a Backfill, and no pending one covers them.`,
        '',
        TableSnapshot.renderChanges(changes),
        '',
        'Nothing was changed. Declare a Backfill for each: a gap version needs the Backfill that fills it, and an index change a new `reindex` Backfill of each entity it touches.',
      ].join('\n');
    case 'backfill-order':
      return `std-toolkit: table "${table}" cannot run its pending Backfills: ${detail ?? 'their order does not resolve'}. Nothing was changed.`;
    case 'breaking':
      return [
        `std-toolkit: persistent table "${table}" cannot be set up: its stored data was written under a contract this change breaks.`,
        '',
        TableSnapshot.renderChanges(changes),
        '',
        'Nothing was changed. Undo the edit and add the change as a new version, or move the data to a new physical table name.',
      ].join('\n');
    case 'mode-change':
      return `std-toolkit: table "${table}" is persistent and cannot become disposable. Nothing was changed. Use a new physical table name to start a disposable table.`;
    case 'replaces-table':
      return [
        `std-toolkit: table "${table}" cannot take this change in place: the database can only make it by replacing the table, which deletes its data. Nothing was changed. Add a global secondary index instead, or declare a new DynamoDB.table resource, with its own id and table name.`,
        ...(changes.length === 0
          ? []
          : ['', TableSnapshot.renderChanges(changes)]),
      ].join('\n');
    case 'renames-table':
      return `std-toolkit: DynamoDB table "${table}" cannot get a new physical name under the same resource: the new name would start an empty table and leave the old one, with its data, behind. Nothing was changed. Declare a new DynamoDB.table resource, with its own id, for the new name.`;
    case 'unreadable':
      return `std-toolkit: persistent table "${table}" has a stored contract this version of std-toolkit cannot read, so its data cannot be checked. Nothing was changed.`;
  }
};
