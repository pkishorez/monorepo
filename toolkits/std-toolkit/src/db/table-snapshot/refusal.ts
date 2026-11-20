import { TableSnapshot, type SnapshotChange } from '../../snapshot/index.js';

/**
 * Whether a physical table's data must survive every schema change
 * (`persistent`) or may be thrown away when one is not safe (`disposable`).
 */
export type TableMode = 'persistent' | 'disposable';

/** What a disposable table does with a change that needs a backfill. */
export type BackfillChoice = 'reindex' | 'wipe';

export type SetupRefusedReason =
  | 'breaking'
  | 'mode-change'
  | 'unreadable'
  | 'replaces-table'
  | 'renames-table';

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
  ) {
    super(refusalMessage(table, reason, changes));
    this.name = 'SetupRefused';
  }
}

const refusalMessage = (
  table: string,
  reason: SetupRefusedReason,
  changes: readonly SnapshotChange[],
) => {
  switch (reason) {
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
      return `std-toolkit: DynamoDB table "${table}" cannot get a new physical name under the same resource: Alchemy would replace it and delete the old table. Nothing was changed. Declare a new DynamoDB.table resource, with its own id, for the new name.`;
    case 'unreadable':
      return `std-toolkit: persistent table "${table}" has a stored snapshot this version of std-toolkit cannot read, so its data cannot be checked. Nothing was changed.`;
  }
};
