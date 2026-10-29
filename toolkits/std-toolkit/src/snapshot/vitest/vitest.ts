import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import { expect } from 'vitest';
import { TableSnapshot } from '../index.js';
import type { SnapshotChange, TableSource } from '../index.js';

export interface SnapshotFileOptions {
  /**
   * What else keeps the table from shipping, each a section of the failure.
   * Any one fails the test, under `-u` as without it, and the file is not
   * written.
   */
  readonly refusals?: readonly string[];
  /**
   * More refusals, judged against the committed file's snapshot, such as
   * setup's own plan from it; not called when there is no file yet.
   */
  readonly refusalsAgainst?: (
    committed: TableSnapshot,
  ) => Promise<readonly string[]>;
}

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

const isBreaking = ({ impact }: SnapshotChange) =>
  impact === 'breaking' || impact === 'unverifiable';

const breakingSection = (
  file: string,
  changes: readonly SnapshotChange[],
): readonly string[] => {
  const blocked = changes.filter(isBreaking);
  return blocked.length === 0
    ? []
    : [
        [
          `Breaking changes against ${file}:`,
          '',
          TableSnapshot.renderChanges(blocked),
          '',
          'Running vitest with -u does not accept a breaking change, and nothing else does: setup and the deploy guard refuse it too. A stored version is frozen once shipped: undo the edit and add the change as a new version instead, or move the data to a new physical table name.',
        ].join('\n'),
      ];
};

/**
 * Checks the table snapshot against the committed file: it fails on a
 * breaking change, or on any of the caller's `refusals`, listing every reason
 * at once, and otherwise requires the file to be up to date.
 *
 * `vitest -u` writes the file only when nothing refuses: for changes that are
 * safe or need a Backfill. It never accepts a breaking change.
 */
export async function expectSnapshotFile(
  table: TableSource,
  file: string,
  options: SnapshotFileOptions = {},
): Promise<void> {
  const state = expect.getState();
  const path =
    state.testPath === undefined
      ? resolve(file)
      : resolve(dirname(state.testPath), file);
  const prior = await readPrior(path, file);
  const current = TableSnapshot.capture(table);
  const changes = prior === undefined ? [] : TableSnapshot.diff(prior, current);
  // Under -u, Vitest writes file snapshots when the test file finishes, so
  // the refusal must come before toMatchFileSnapshot is called.
  const refused = [
    ...(options.refusals ?? []),
    ...breakingSection(file, changes),
    ...(prior === undefined || options.refusalsAgainst === undefined
      ? []
      : await options.refusalsAgainst(prior)),
  ];
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
          `Nothing refuses these changes. Run vitest with -u to accept them into ${file}.`,
        ].join('\n');
  await expect(await serialize(current), message).toMatchFileSnapshot(path);
}
