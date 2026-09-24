import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import { expect } from 'vitest';
import { Snapshot, TableSnapshotFileESchema } from '../index.js';
import type { TableSnapshotFile } from '../index.js';
import {
  captureTableSnapshotFile,
  type GoldenRowTable,
} from '../golden-rows/index.js';

const readPrior = async (
  path: string,
): Promise<TableSnapshotFile | undefined> => {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    if ((cause as { code?: string }).code === 'ENOENT') return undefined;
    throw cause;
  }
  return Effect.runPromise(Snapshot.decodeTableFile(JSON.parse(source)));
};

const serialize = (file: TableSnapshotFile): Promise<string> =>
  Effect.runPromise(
    TableSnapshotFileESchema.encode(file).pipe(
      Effect.map((encoded) => `${JSON.stringify(encoded, null, 2)}\n`),
    ),
  );

/**
 * The recommended test for a table: one call, one committed JSON file. The
 * file holds the table's schema contract and golden rows for every migration
 * step. On a mismatch the failure names each change and its classification,
 * so a reviewer or an agent sees "Task v1 edited" or "Migration Task → v2"
 * rather than a JSON diff. `vitest -u` accepts the current document, exactly
 * like any other file snapshot.
 *
 * `file` resolves against the calling test file, as `toMatchFileSnapshot`
 * does.
 */
export async function expectTableSnapshot(
  table: GoldenRowTable,
  file: string,
): Promise<void> {
  const testPath = expect.getState().testPath;
  const path =
    testPath === undefined ? resolve(file) : resolve(dirname(testPath), file);
  const prior = await readPrior(path);
  const current = await Effect.runPromise(
    captureTableSnapshotFile(table, prior),
  );
  const changes =
    prior === undefined ? [] : Snapshot.diffTableFile(prior, current);
  const message =
    changes.length === 0
      ? undefined
      : [
          `Table "${current.snapshot.logicalName}" no longer matches its snapshot file:`,
          '',
          Snapshot.renderChanges(changes),
          '',
          `Run vitest with -u to accept these changes into ${file}.`,
        ].join('\n');
  await expect(await serialize(current), message).toMatchFileSnapshot(path);
}
