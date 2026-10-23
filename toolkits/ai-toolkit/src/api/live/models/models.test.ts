import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import {
  HarnessBinaries,
  HarnessError,
  type Harness,
} from '../../../services/harness/contract/index.js';
import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeHarness } from '../../../services/harness/fake/index.js';
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

const list = (
  fetch: () => Promise<unknown>,
  cacheFile: string,
  harness: Harness = makeFakeHarness().harness,
) =>
  Effect.runPromise(
    Effect.flatMap(Models, (models) => models.list(harness)).pipe(
      Effect.provide(
        Models.layer({ cacheFile, fetch }).pipe(
          Layer.provide(HarnessBinaries.layerDefault),
        ),
      ),
    ),
  );

const tempFile = () => {
  const folder = mkdtempSync(join(tmpdir(), 'ai-models-'));
  folders.push(folder);
  return join(folder, 'models.json');
};

/** The fake harness, asking its account with `ask`, counting each ask. */
const withAccount = (
  ask: Harness['availableModels'] & {},
): { harness: Harness; asks: () => number } => {
  let asks = 0;
  return {
    harness: {
      ...makeFakeHarness().harness,
      availableModels: Effect.suspend(() => {
        asks++;
        return ask;
      }),
    },
    asks: () => asks,
  };
};

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

  it("lists the account's models, filled in from models.dev, newest first", async () => {
    const { harness } = withAccount(
      Effect.succeed([
        { id: 'claude-old', name: 'Old one' },
        { id: 'claude-fresh', name: 'Fresh', isDefault: true },
        { id: 'claude-new' },
      ]),
    );
    expect(
      await list(() => Promise.resolve(catalog), tempFile(), harness),
    ).toEqual([
      { id: 'claude-new', name: 'New', releaseDate: '2026-05-01' },
      { id: 'claude-old', name: 'Old', releaseDate: '2024-01-01' },
      { id: 'claude-fresh', name: 'Fresh', releaseDate: null },
    ]);
  });

  it("lists the account's models alone when models.dev is unreachable", async () => {
    const { harness } = withAccount(
      Effect.succeed([{ id: 'claude-b', name: 'B' }, { id: 'claude-a' }]),
    );
    expect(
      await list(
        () => Promise.reject(new Error('offline')),
        tempFile(),
        harness,
      ),
    ).toEqual([
      { id: 'claude-b', name: 'B', releaseDate: null },
      { id: 'claude-a', name: 'claude-a', releaseDate: null },
    ]);
  });

  it('falls back to what models.dev lists when the account cannot be asked', async () => {
    const { harness } = withAccount(
      Effect.fail(new HarnessError({ message: 'not logged in' })),
    );
    expect(
      await list(() => Promise.resolve(catalog), tempFile(), harness),
    ).toEqual([
      { id: 'claude-new', name: 'New', releaseDate: '2026-05-01' },
      { id: 'claude-old', name: 'Old', releaseDate: '2024-01-01' },
    ]);
  });

  it("asks the account once for a while, and defaults to the account's default", async () => {
    const account = withAccount(
      Effect.succeed([{ id: 'claude-a' }, { id: 'claude-b', isDefault: true }]),
    );
    const failing = withAccount(
      Effect.fail(new HarnessError({ message: 'not logged in' })),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const models = yield* Models;
        yield* models.list(account.harness);
        return [
          yield* models.defaultModel(account.harness),
          yield* models.defaultModel(failing.harness),
          yield* models.defaultModel(makeFakeHarness().harness),
        ];
      }).pipe(
        Effect.provide(
          Models.layer({
            cacheFile: tempFile(),
            fetch: () => Promise.resolve(catalog),
          }).pipe(Layer.provide(HarnessBinaries.layerDefault)),
        ),
      ),
    );
    expect(result).toEqual(['claude-b', 'claude-test', 'claude-test']);
    expect(account.asks()).toBe(1);
  });
});
