import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { folderShelf } from '../index.ts';

/*
 * The folder Shelf, as `alchemy dev` puts its build on it: the file at
 * `<root>/<name>/<sha256>.mjs`, read by its `file:` URL, never changed.
 */

const HASH = 'a'.repeat(64);

/** The URL a put answers; an Output reads as a thenable, so it is never awaited. */
const urlOf = (put: Output.Output<string>) =>
  Output.isLiteralExpr<string>(put) ? put.value : null;

describe('the folder Shelf', () => {
  it('keeps a Release at `<root>/<name>/<sha256>.mjs`, once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'connect-shelf-'));
    const root = join(dir, 'shelf');
    const file = join(dir, 'code.mjs');
    writeFileSync(file, 'export const first = 1;\n');
    const shelf = folderShelf(root);
    const url = urlOf(
      Effect.runSync(shelf.put({ name: 'code', hash: HASH, file })),
    );
    expect(url).toMatch(/^file:\/\//);
    const kept = fileURLToPath(url!);
    expect(kept).toBe(join(root, 'code', `${HASH}.mjs`));
    writeFileSync(file, 'export const second = 2;\n');
    Effect.runSync(shelf.put({ name: 'code', hash: HASH, file }));
    expect(readFileSync(kept, 'utf8')).toBe('export const first = 1;\n');
  });
});
