import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import { expect } from 'vitest';
import { TableSnapshot } from '../index.js';
import type { TableSource } from '../index.js';

// A file this toolkit cannot read, such as one in an older document format,
// is replaced under `-u` and otherwise fails with how to replace it.
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
    if (expect.getState().snapshotState.snapshotUpdateState === 'all') {
      return undefined;
    }
    throw new Error(
      `${file} cannot be read as a table snapshot. Run vitest with -u to replace it.`,
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

export async function expectTableSnapshot(
  table: TableSource,
  file: string,
): Promise<void> {
  const testPath = expect.getState().testPath;
  const path =
    testPath === undefined ? resolve(file) : resolve(dirname(testPath), file);
  const prior = await readPrior(path, file);
  const current = TableSnapshot.capture(table);
  const changes = prior === undefined ? [] : TableSnapshot.diff(prior, current);
  if (prior !== undefined && changes.length === 0) return;
  const message =
    changes.length === 0
      ? undefined
      : [
          `Table "${current.logicalName}" no longer matches its snapshot file:`,
          '',
          TableSnapshot.renderChanges(changes),
          '',
          `Run vitest with -u to accept these changes into ${file}.`,
        ].join('\n');
  await expect(await serialize(current), message).toMatchFileSnapshot(path);
}
