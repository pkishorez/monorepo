import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Downloads } from '@kestack/cli-platform/files';
import { CLOUDFLARED_KEY, cloudflared } from '../binary.js';

/*
 * How far a download of cloudflared has come, read from the size of what it
 * writes, in a real cache, with only the npm package's `install` faked.
 */

const installing = vi.hoisted(() => ({
  run: (_file: string): Promise<string> => Promise.resolve(''),
}));

vi.mock('cloudflared', () => ({
  install: (file: string) => installing.run(file),
}));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cache: string;
beforeEach(() => {
  cache = mkdtempSync(join(tmpdir(), 'connect-binary-'));
});
afterEach(() => {
  rmSync(cache, { recursive: true, force: true });
});

const NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

/** Gets cloudflared with a cache of its own: its path, and every size told. */
const got = () => {
  const told: Array<number> = [];
  return Effect.runPromise(
    cloudflared(
      (bytes) => Effect.sync(() => void told.push(bytes)),
      '10 millis',
    ).pipe(
      Effect.provide(Downloads.layer(cache)),
      Effect.map((file) => ({ file, told })),
    ),
  );
};

describe('a download of cloudflared', () => {
  it('tells the size of the file as it is written, 0 while there is none', async () => {
    installing.run = async (file) => {
      await pause(50);
      writeFileSync(file, Buffer.alloc(1_000));
      await pause(50);
      writeFileSync(file, Buffer.alloc(3_000));
      await pause(50);
      return file;
    };
    const { file, told } = await got();
    expect(file.endsWith(NAME)).toBe(true);
    expect(told[0]).toBe(0);
    expect(told).toContain(1_000);
    expect(told).toContain(3_000);
    expect(told).toEqual([...told].sort((a, b) => a - b));
  });

  it('tells the size of `<file>.tgz`, which a Mac downloads to', async () => {
    installing.run = async (file) => {
      await pause(30);
      writeFileSync(`${file}.tgz`, Buffer.alloc(2_000));
      await pause(50);
      rmSync(`${file}.tgz`);
      writeFileSync(file, Buffer.alloc(5_000));
      await pause(30);
      return file;
    };
    const { told } = await got();
    expect(told[0]).toBe(0);
    expect(told).toContain(2_000);
    expect(told).toContain(5_000);
  });

  it('stops telling once it is done', async () => {
    installing.run = async (file) => {
      writeFileSync(file, Buffer.alloc(10));
      await pause(30);
      return file;
    };
    const { told } = await got();
    const after = told.length;
    await pause(50);
    expect(told.length).toBe(after);
  });

  it('tells nothing for a cached binary, and does not download it', async () => {
    const entry = join(cache, 'downloads', CLOUDFLARED_KEY);
    mkdirSync(entry, { recursive: true });
    writeFileSync(join(entry, NAME), 'cached');
    installing.run = () => Promise.reject(new Error('it was downloaded'));
    const { file, told } = await got();
    expect(file).toBe(join(entry, NAME));
    expect(told).toEqual([]);
  });

  it('fails saying why, and stops telling', async () => {
    installing.run = async () => {
      await pause(30);
      throw new Error('no network');
    };
    await expect(got()).rejects.toThrow(
      'Could not download cloudflared: no network',
    );
  });
});
