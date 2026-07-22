import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ejectStories,
  isLaymosStoryFile,
  transformStorySource,
} from '../src/story/eject/index.js';

const temporaryDirectories: string[] = [];
const fixtureRoot = join(import.meta.dirname, 'fixtures', 'story-ejection');
const beforeFixtureDirectory = join(fixtureRoot, 'before');
const afterFixtureDirectory = join(fixtureRoot, 'after');
const invalidFixtureDirectory = join(fixtureRoot, 'invalid');
const fixtureNames = readdirSync(beforeFixtureDirectory).sort();
const invalidFixtureNames = readdirSync(invalidFixtureDirectory)
  .filter((name) => name.endsWith('.ts'))
  .sort();

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Story ejection transformer', () => {
  it('has one expected output for every input fixture', () => {
    expect(readdirSync(afterFixtureDirectory).sort()).toEqual(fixtureNames);
  });

  it.each(fixtureNames)('transforms %s', async (fixtureName) => {
    const [before, after] = await Promise.all([
      readFile(join(beforeFixtureDirectory, fixtureName), 'utf8'),
      readFile(join(afterFixtureDirectory, fixtureName), 'utf8'),
    ]);
    const output = transformStorySource(before, fixtureName);

    expect(output).toBe(after);
    expect(transformStorySource(output, fixtureName)).toBe(output);
  });

  it.each(invalidFixtureNames)(
    'rejects invalid fixture %s',
    async (fixtureName) => {
      const [source, expectedMessage] = await Promise.all([
        readFile(join(invalidFixtureDirectory, fixtureName), 'utf8'),
        readFile(
          join(
            invalidFixtureDirectory,
            fixtureName.replace(/\.ts$/, '.error.txt'),
          ),
          'utf8',
        ),
      ]);

      expect(() => transformStorySource(source, fixtureName)).toThrow(
        expectedMessage.trim(),
      );
    },
  );

  it('recognizes every Laymos Story extension without matching Storybook', () => {
    const source = `import { story } from 'laymos/story';`;
    for (const extension of [
      'ts',
      'tsx',
      'mts',
      'cts',
      'js',
      'jsx',
      'mjs',
      'cjs',
    ]) {
      expect(isLaymosStoryFile(source, `checkout.story.${extension}`)).toBe(
        true,
      );
    }
    expect(isLaymosStoryFile(source, 'checkout.stories.tsx')).toBe(false);
    expect(
      isLaymosStoryFile(`export const story = {};`, 'checkout.story.ts'),
    ).toBe(false);
  });
});

describe('Story ejection workflow', () => {
  it('previews without writing, then rewrites source and deletes only Laymos Stories', async () => {
    const baseDir = await makeBaseDir();
    await mkdir(join(baseDir, 'src'));
    await mkdir(join(baseDir, 'stories'));
    await writeFile(
      join(baseDir, 'src', 'work.ts'),
      `import { Effect } from 'effect'; import { step } from 'laymos/story'; export const work = step('Work', { description: 'Works.' }, () => Effect.void);`,
    );
    await writeFile(
      join(baseDir, 'stories', 'work.story.ts'),
      `import { story } from 'laymos/story'; story('Work', { description: 'Works.' });`,
    );
    await writeFile(
      join(baseDir, 'stories', 'work.stories.tsx'),
      `import { story } from 'laymos/story'; export default {};`,
    );
    await writeFile(
      join(baseDir, 'stories', 'support.ts'),
      `import { storyGroup } from 'laymos/story'; export const group = storyGroup('Work', { description: 'Works.' });`,
    );

    const preview = await runEjection(baseDir, true);
    expect(preview.changed).toEqual(['src/work.ts']);
    expect(preview.deleted).toEqual(['stories/work.story.ts']);
    expect(existsSync(join(baseDir, 'stories', 'work.story.ts'))).toBe(true);
    expect(await readFile(join(baseDir, 'src', 'work.ts'), 'utf8')).toContain(
      "from 'laymos/story'",
    );

    const result = await runEjection(baseDir, false);
    expect(result.changed).toEqual(['src/work.ts']);
    expect(result.deleted).toEqual(['stories/work.story.ts']);
    expect(await readFile(join(baseDir, 'src', 'work.ts'), 'utf8')).toContain(
      'Effect.suspend',
    );
    expect(existsSync(join(baseDir, 'stories', 'work.story.ts'))).toBe(false);
    expect(existsSync(join(baseDir, 'stories', 'work.stories.tsx'))).toBe(true);
    expect(existsSync(join(baseDir, 'stories', 'support.ts'))).toBe(true);
  });

  it('changes nothing when any source file fails preflight', async () => {
    const baseDir = await makeBaseDir();
    await writeFile(
      join(baseDir, 'valid.ts'),
      `import { Effect } from 'effect'; import { step } from 'laymos/story'; export const work = step('Work', { description: 'Works.' }, () => Effect.void);`,
    );
    await writeFile(
      join(baseDir, 'invalid.ts'),
      `import { flow } from 'laymos/story'; export const escaped = flow;`,
    );
    const original = await readFile(join(baseDir, 'valid.ts'), 'utf8');

    await expect(runEjection(baseDir, false)).rejects.toThrow(
      'preflight failed',
    );
    expect(await readFile(join(baseDir, 'valid.ts'), 'utf8')).toBe(original);
  });
});

async function makeBaseDir(): Promise<string> {
  const directory = await mkdtemp(join(import.meta.dirname, 'tmp-eject-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runEjection(baseDir: string, dryRun: boolean) {
  return Effect.runPromise(
    ejectStories(baseDir, { dryRun }).pipe(Effect.provide(NodeServices.layer)),
  );
}
