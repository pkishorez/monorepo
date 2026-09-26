import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Effect } from 'effect';
import { expect } from 'vitest';
import { TableSnapshot, TableSnapshotESchema } from '../index.js';
import type { TableSource } from '../index.js';

const readPrior = async (path: string): Promise<TableSnapshot | undefined> => {
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (cause) {
    if ((cause as { code?: string }).code === 'ENOENT') return undefined;
    throw cause;
  }
  return Effect.runPromise(TableSnapshot.parse(JSON.parse(source)));
};

const serialize = (snapshot: TableSnapshot): Promise<string> =>
  Effect.runPromise(
    TableSnapshotESchema.encode(snapshot).pipe(
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
  const prior = await readPrior(path);
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
