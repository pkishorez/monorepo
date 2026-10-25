import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { HarnessBinaries, type Harness } from '../contract/index.js';
import { binaryAt, checkBinary } from './binaries.js';

const folder = mkdtempSync(join(tmpdir(), 'ai-toolkit-binaries-'));
/** A harness whose binary runs wherever it is set. */
const harness = {
  binary: Effect.map(
    Effect.flatMap(HarnessBinaries, (binaries) => binaries.path('claude')),
    (path) => ({
      path: path ?? '/usr/local/bin/claude',
      version: '1.0.0',
      error: null,
      isDefault: path === undefined,
    }),
  ),
} as unknown as Harness;

const whyNot = (path: string) =>
  Effect.runPromise(
    Effect.map(Effect.flip(checkBinary(harness, path)), (e) => e.message),
  );

describe('Harness Binaries', () => {
  it('reads a harness binary at a path, or its default', async () => {
    expect((await Effect.runPromise(binaryAt(harness, null))).isDefault).toBe(
      true,
    );
    const at = await Effect.runPromise(binaryAt(harness, '/x/claude'));
    expect(at.isDefault).toBe(false);
  });

  it('takes a path only once it runs', async () => {
    expect(await whyNot('/no/such/binary')).toBe(
      'Nothing is at /no/such/binary',
    );
    const plain = join(folder, 'plain');
    writeFileSync(plain, 'not a program');
    expect(await whyNot(plain)).toBe(`${plain} is not executable`);

    const good = join(folder, 'claude');
    writeFileSync(good, '#!/bin/sh\necho fake\n');
    chmodSync(good, 0o755);
    expect(await Effect.runPromise(checkBinary(harness, ` ${good} `))).toBe(
      good,
    );
  });
});
