import { Effect } from 'effect';
import {
  findUpgradeFailures,
  type UpgradeCheckOptions,
  type UpgradeRoot,
} from '../../eschema/testing/index.js';
import { expectSnapshotFile } from '../../snapshot/vitest/index.js';
import type { StdTable } from '../std-table/table/index.js';

/** How many rows to generate for the upgrade check, and from which seed. */
export type ShippableOptions = UpgradeCheckOptions;

/**
 * Each entity's schema, with the key paths its rows are stored under: a
 * migration that changes one strands the row at a key it no longer derives.
 */
const upgradeRoots = (table: StdTable): readonly UpgradeRoot[] =>
  table.registeredEntities.map((entity) =>
    entity.kind === 'keyed'
      ? { schema: entity.schema, unchanged: [...entity.primary.pk] }
      : { schema: entity.schema },
  );

/**
 * The one test a persistent table needs; a table kept only in disposable
 * physical tables needs none. It fails, listing every reason at once, unless
 * the table is safe to ship:
 *
 * - every stored version of every schema the table reaches upgrades to the
 *   latest, and a keyed row keeps its id and partition key;
 * - the table snapshot has no breaking change against the committed file,
 *   so setup would accept it on a persistent table;
 * - the committed file is up to date.
 *
 * `vitest -u` writes the file only for changes setup accepts. It never
 * accepts a breaking change or a failing upgrade.
 */
export async function expectTableShippable(
  table: StdTable,
  file: string,
  options: ShippableOptions = {},
): Promise<void> {
  if (table.registeredEntities.length === 0) {
    throw new Error(
      `Table "${table.logicalName}" has no registered entities; import the modules that define them before checking it.`,
    );
  }
  const upgrades = await Effect.runPromise(
    findUpgradeFailures(upgradeRoots(table), options),
  );
  await expectSnapshotFile(table, file, {
    refusals:
      upgrades.length === 0
        ? []
        : [
            [
              'Stored versions that do not upgrade:',
              '',
              ...upgrades,
              '',
              'Fix the migration or the schema. Running vitest with -u does not change this.',
            ].join('\n'),
          ],
  });
}
