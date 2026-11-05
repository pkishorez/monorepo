import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Output from 'alchemy/Output';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { folderFiles } from '../index.ts';

/*
 * Release Files in a folder, as `alchemy dev` puts its build there: the file at
 * `<root>/<name>/<sha256>.mjs`, read by its `file:` URL, never changed.
 */

const HASH = 'a'.repeat(64);

/** The URL a put answers; an Output reads as a thenable, so it is never awaited. */
const urlOf = (put: Output.Output<string>) =>
  Output.isLiteralExpr<string>(put) ? put.value : null;

describe('Release Files in a folder', () => {
  it('keeps a Release at `<root>/<name>/<sha256>.mjs`, once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'connect-files-'));
    const root = join(dir, 'files');
    const file = join(dir, 'code.mjs');
    writeFileSync(file, 'export const first = 1;\n');
    const files = folderFiles(root);
    const url = urlOf(
      Effect.runSync(files.put({ name: 'code', hash: HASH, file })),
    );
    expect(url).toMatch(/^file:\/\//);
    const kept = fileURLToPath(url!);
    expect(kept).toBe(join(root, 'code', `${HASH}.mjs`));
    writeFileSync(file, 'export const second = 2;\n');
    Effect.runSync(files.put({ name: 'code', hash: HASH, file }));
    expect(readFileSync(kept, 'utf8')).toBe('export const first = 1;\n');
  });
});
