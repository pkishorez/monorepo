import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  appendRelease,
  builtHash,
  checkBuild,
  logFile,
  readLog,
  type ReleaseLog,
  writeLog,
} from '../index.ts';

/*
 * The Release Log: which Release a build is, and a new one appended.
 */

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const log: ReleaseLog = {
  plugin: 'code',
  releases: [
    { hash: A, summary: 'first' },
    { hash: B, summary: 'second' },
  ],
};

describe('a Release Log', () => {
  it('lets a build through only when it is the latest Release', async () => {
    expect(await Effect.runPromise(checkBuild(log, B))).toEqual({
      hash: B,
      summary: 'second',
    });
    const earlier = await Effect.runPromise(Effect.flip(checkBuild(log, A)));
    expect(earlier.message).toMatch(/older than its latest Release/);
    const changed = await Effect.runPromise(
      Effect.flip(checkBuild(log, 'c'.repeat(64))),
    );
    expect(changed.message).toMatch(
      /The code Plugin changed.*pnpm release:plugin code/,
    );
    const empty = { plugin: 'code', releases: [] };
    expect(
      (await Effect.runPromise(Effect.flip(checkBuild(empty, A)))).earlier,
    ).toBe(false);
  });

  it('appends a new build as the latest, and refuses one already in it', async () => {
    const next = await Effect.runPromise(
      appendRelease(log, { hash: 'c'.repeat(64), summary: 'third' }),
    );
    expect(next.releases.at(-1)).toEqual({
      hash: 'c'.repeat(64),
      summary: 'third',
    });
    const again = await Effect.runPromise(
      Effect.flip(appendRelease(log, { hash: A, summary: 'again' })),
    );
    expect(again._tag).toBe('AlreadyReleased');
  });

  it('is read back as it was written, and refuses a file that is not one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'connect-log-'));
    const file = join(dir, 'releases.json');
    await Effect.runPromise(writeLog(file, log));
    expect(await Effect.runPromise(readLog(file))).toEqual(log);
    writeFileSync(
      file,
      '{"plugin":"code","releases":[{"hash":"nope","summary":"x"}]}',
    );
    await expect(Effect.runPromise(readLog(file))).rejects.toThrow(
      /not a Release Log/,
    );
    await expect(
      Effect.runPromise(readLog(join(dir, 'missing.json'))),
    ).rejects.toThrow(/No Release Log/);
  });

  it("keeps the code Plugin's Log, its latest last", async () => {
    const code = await Effect.runPromise(readLog(logFile('code')));
    expect(code.plugin).toBe('code');
    expect(code.releases.length).toBeGreaterThan(0);
  });

  it('hashes a build as sha256 does, and none when it is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'connect-build-'));
    writeFileSync(join(dir, 'code.mjs'), 'abc');
    expect(builtHash(join(dir, 'code.mjs'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(builtHash(join(dir, 'missing.mjs'))).toBeNull();
  });
});
