import { Effect } from 'effect';
import {
  findUpgradeFailures,
  type UpgradeRoot,
} from '../../eschema/testing/index.js';
import { expectSnapshotFile } from '../../snapshot/vitest/index.js';
import type { StdTable } from '../std-table/table/index.js';
import {
  findBackfillFailures,
  type BackfillCheckOptions,
} from './backfill-check.js';

/** How many rows to generate, and from which seed; for upgrades and Backfills alike. */
export type ShippableOptions = BackfillCheckOptions;

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

const section = (
  title: string,
  entries: readonly string[],
  hint: string,
): readonly string[] =>
  entries.length === 0 ? [] : [[title, '', ...entries, '', hint].join('\n')];

/**
 * The one test a persistent table needs; a table kept only in disposable
 * physical tables needs none. It fails, listing every reason at once, unless
 * the table is safe to ship:
 *
 * - every stored version of every schema the table reaches upgrades to the
 *   latest, and a keyed row keeps its id and partition key;
 * - every gap Backfill, run by setup on a Memory table over generated rows
 *   (with the other entities empty, and holding generated rows), brings each
 *   row to the latest version with its id and partition key kept;
 * - the table snapshot has no breaking change against the committed file;
 * - the committed file is up to date.
 *
 * `vitest -u` writes the file only for changes that are safe or need a
 * Backfill. It never accepts a breaking change, a failing upgrade or a
 * failing Backfill.
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
  const [upgrades, backfills] = await Effect.runPromise(
    Effect.all([
      findUpgradeFailures(upgradeRoots(table), options),
      findBackfillFailures(table, options),
    ]),
  );
  await expectSnapshotFile(table, file, {
    refusals: [
      ...section(
        'Stored versions that do not upgrade:',
        upgrades,
        'Fix the migration or the schema. Running vitest with -u does not change this.',
      ),
      ...section(
        'Backfills that do not bring every row to the latest version:',
        backfills,
        'A Backfill must succeed for every row, whatever the other entities hold, and keep its id and partition key. Fix the Backfill. Running vitest with -u does not change this.',
      ),
    ],
  });
}
