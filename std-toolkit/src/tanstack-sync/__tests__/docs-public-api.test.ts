import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRootFile = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

describe('public documentation', () => {
  it('uses the current offline storage and sync public API in README examples', () => {
    const readme = readRootFile('README.md');

    expect(readme).toContain(
      "import { createStdSync, syncStrategy, singleItemSyncStrategy, paceStrategy } from 'std-toolkit/tanstack-sync';",
    );
    expect(readme).toContain(
      "import { idbStorage } from 'std-toolkit/tanstack-sync/offline-storage/idb';",
    );
    expect(readme).toContain(
      "const std = createStdSync({ offlineStorage: idbStorage({ name: 'app-sync', version: 1 }) });",
    );
    expect(readme).toContain('offlineStorage: false');
    expect(readme).toContain('utils.writeUpsert(entityOrEntities)');
    expect(readme).toContain('Effect.Effect<void, WriteError>');
    expect(readme).not.toMatch(
      /@std-toolkit\/cache|totalSync|onDemand|fetchMore|queueUpdate/,
    );
  });

  it('does not describe SoT or Sync State as memory-only', () => {
    const context = readRootFile('CONTEXT.md');
    const story = readRootFile('story.md');

    expect(`${context}\n${story}`).not.toMatch(/in-memory only/i);
  });
});
