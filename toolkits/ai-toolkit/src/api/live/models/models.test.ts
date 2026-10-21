import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeHarness } from '../../../fake-harness/index.js';
import { Models } from './index.js';

const catalog = {
  anthropic: {
    models: {
      'claude-old': {
        id: 'claude-old',
        name: 'Old',
        release_date: '2024-01-01',
      },
      'claude-new': {
        id: 'claude-new',
        name: 'New',
        release_date: '2026-05-01',
      },
      'other-x': { id: 'other-x', name: 'X', release_date: '2026-09-01' },
    },
  },
  openai: { models: { 'gpt-z': { id: 'gpt-z' } } },
};

const folders: Array<string> = [];
afterEach(() => {
  for (const made of folders.splice(0)) rmSync(made, { recursive: true });
});

const list = (fetch: () => Promise<unknown>, cacheFile: string) =>
  Effect.runPromise(
    Effect.flatMap(Models, (models) =>
      models.list(makeFakeHarness().harness),
    ).pipe(Effect.provide(Models.layer({ cacheFile, fetch }))),
  );

describe('Models', () => {
  it('lists what the harness accepts, newest first, and reads the saved copy when offline', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'ai-models-'));
    folders.push(folder);
    const cacheFile = join(folder, 'models.json');
    const online = await list(() => Promise.resolve(catalog), cacheFile);
    expect(online).toEqual([
      { id: 'claude-new', name: 'New', releaseDate: '2026-05-01' },
      { id: 'claude-old', name: 'Old', releaseDate: '2024-01-01' },
    ]);
    const offline = await list(
      () => Promise.reject(new Error('offline')),
      cacheFile,
    );
    expect(offline).toEqual(online);
  });

  it('fails when offline with no saved copy', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'ai-models-'));
    folders.push(folder);
    await expect(
      list(
        () => Promise.reject(new Error('offline')),
        join(folder, 'none.json'),
      ),
    ).rejects.toThrow(/unreachable/);
  });
});
