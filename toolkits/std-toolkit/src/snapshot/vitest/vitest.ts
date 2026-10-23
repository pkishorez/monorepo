import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import { expect } from 'vitest';
import {
  findUpgradeFailures,
  type UpgradeCheckOptions,
  type UpgradeRoot,
} from '../../eschema/testing/index.js';
import { TableSnapshot } from '../index.js';
import type { SnapshotChange, TableSource } from '../index.js';

export type ShippableOptions = UpgradeCheckOptions;

// A file the toolkit cannot read is never replaced, not even under `-u`: it is
// the baseline breaking changes are judged against, so replacing it would
// accept them unseen. Older document formats still read, as an ESchema does.
const readPrior = async (
  path: string,
  file: string,
): Promise<TableSnapshot | undefined> => {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    if ((cause as { code?: string }).code === 'ENOENT') return undefined;
    throw cause;
  }
  try {
    return await Effect.runPromise(TableSnapshot.parse(JSON.parse(source)));
  } catch (cause) {
    throw new Error(
      `${file} cannot be read as a table snapshot, so breaking changes cannot be checked against it. Running vitest with -u does not replace it. Restore it from version control; only a person who has checked that nothing deployed depends on it may delete it to start a new baseline.`,
      { cause },
    );
  }
};

const serialize = (snapshot: TableSnapshot): Promise<string> =>
  Effect.runPromise(
    TableSnapshot.serialize(snapshot).pipe(
      Effect.map((encoded) => `${JSON.stringify(encoded, null, 2)}\n`),
    ),
  );

/**
 * Each entity's schema, with the key paths its rows are stored under: a
 * migration that changes one strands the row at a key it no longer derives.
 */
const upgradeRoots = (table: TableSource): readonly UpgradeRoot[] =>
  table.registeredEntities.map((entity) =>
    entity.kind === 'keyed'
      ? { schema: entity.schema, unchanged: [...entity.primary.pk] }
      : { schema: entity.schema },
  );

const isBreaking = ({ impact }: SnapshotChange) =>
  impact === 'breaking' || impact === 'unverifiable';

/** Why the table cannot ship, as sections of the failure; empty when it can. */
const refusals = (
  file: string,
  changes: readonly SnapshotChange[],
  upgrades: readonly string[],
): readonly string[] => {
  const blocked = changes.filter(isBreaking);
  return [
    ...(upgrades.length === 0
      ? []
      : [
          [
            'Stored versions that do not upgrade:',
            '',
            ...upgrades,
            '',
            'Fix the migration or the schema. Running vitest with -u does not change this.',
          ].join('\n'),
        ]),
    ...(blocked.length === 0
      ? []
      : [
          [
            `Breaking changes against ${file}:`,
            '',
            TableSnapshot.renderChanges(blocked),
            '',
            'Running vitest with -u does not accept a breaking change, and nothing else does: setup and the deploy guard refuse it too. A stored version is frozen once shipped: undo the edit and add the change as a new version instead, or move the data to a new physical table name.',
          ].join('\n'),
        ]),
  ];
};

/**
 * The one test a persistent table needs; a table kept only in disposable
 * physical tables needs none. It fails unless the table is safe to ship:
 *
 * - every stored version of every schema the table reaches upgrades to the
 *   latest, and a keyed row keeps its id and partition key;
 * - the table snapshot has no breaking change against the committed file;
 * - the committed file is up to date.
 *
 * `vitest -u` writes the file only for changes that are safe or need a
 * backfill. It never accepts a breaking change or a failing upgrade.
 */
export async function expectTableShippable(
  table: TableSource,
  file: string,
  options: ShippableOptions = {},
): Promise<void> {
  if (table.registeredEntities.length === 0) {
    throw new Error(
      `Table "${table.logicalName}" has no registered entities; import the modules that define them before checking it.`,
    );
  }
  const state = expect.getState();
  const path =
    state.testPath === undefined
      ? resolve(file)
      : resolve(dirname(state.testPath), file);
  const prior = await readPrior(path, file);
  const current = TableSnapshot.capture(table);
  const changes = prior === undefined ? [] : TableSnapshot.diff(prior, current);
  const upgrades = await Effect.runPromise(
    findUpgradeFailures(upgradeRoots(table), options),
  );
  const refused = refusals(file, changes, upgrades);
  if (refused.length > 0) {
    throw new Error(
      [`Table "${table.logicalName}" is not safe to ship.`, ...refused].join(
        '\n\n',
      ),
    );
  }
  if (prior !== undefined && changes.length === 0) return;
  const message =
    changes.length === 0
      ? undefined
      : [
          `Table "${table.logicalName}" no longer matches its snapshot file:`,
          '',
          TableSnapshot.renderChanges(changes),
          '',
          `These changes keep every stored row readable. Run vitest with -u to accept them into ${file}.`,
        ].join('\n');
  await expect(await serialize(current), message).toMatchFileSnapshot(path);
}
