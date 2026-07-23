import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ejectStories,
  isLaymosStoryFile,
  projectStorySource,
  storyDecisionSourceRoles,
  transformStorySource,
  validateStoryAuthoringSource,
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

  it('projects blocks and decision arms into ejected and clean ranges', () => {
    const source = `import { Effect } from 'effect';
import { decision, exhaustive, orElse, step, when } from 'laymos/story';

// Explain the implementation.
const shared = () => {
  const nested = () => 1;
  return nested();
};
const unused = () => 'noise';
export const load = step('Load', { description: 'Loads.' }, () => Effect.succeed(shared()));

export const route = decision('Route', { description: 'Routes.' }, 'yes').pipe(
  when('yes', { description: 'Accepts.' }, () => load),
  orElse({ description: 'Rejects.' }, () => Effect.void),
);

export class Worker {
  constructor(readonly value = 1) {}
  deadMethod() { return 'noise'; }
  dependency() { return this.value; }
  run() {
    return step('Class load', { description: 'Loads from a class.' }, () => Effect.succeed(this.dependency()));
  }
}
`;
    const anchors = [
      { id: 'load', ...locationOf(source, 'step(') },
      { id: 'route', ...locationOf(source, 'decision(') },
      { id: 'yes', ...locationOf(source, "when('yes'") },
      { id: 'otherwise', ...locationOf(source, 'orElse(') },
      { id: 'worker', ...locationOf(source, "step('Class load'") },
    ];

    const projected = projectStorySource(source, 'route.ts', anchors);

    expect(projected.ejected.content).not.toContain('Effect.suspend');
    expect(projected.ejected.content).toContain('Match.value');
    expect(
      new Set(
        projected.ejected.ranges
          .filter(({ classification }) => classification === 'narrated')
          .map(({ id }) => id),
      ),
    ).toEqual(new Set(['load', 'route', 'yes', 'otherwise', 'worker']));
    expect(projected.clean.content).toContain(
      "import { Effect, Match } from 'effect';",
    );
    expect(projected.clean.content).not.toContain('Explain');
    expect(projected.clean.content).not.toContain('description');
    expect(projected.clean.content).toContain('const shared');
    expect(projected.clean.content).toContain('const nested');
    expect(projected.clean.content).not.toContain('const unused');
    expect(projected.clean.content).toContain('constructor(');
    expect(projected.clean.content).toContain('dependency()');
    expect(projected.clean.content).toContain('run()');
    expect(projected.clean.content).not.toContain('deadMethod()');
    expect(projectionText(projected.clean, 'yes')).toContain(
      "Match.when('yes'",
    );
    expect(projectionText(projected.clean, 'otherwise')).toContain(
      'Match.orElse',
    );
    expect(projectionText(projected.clean, 'route')).toContain('Match.value');
  });

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

  it('classifies assigned Decisions as values and returned Decisions as control flow', () => {
    const source = `
import { Effect } from 'effect';
import { decision, exhaustive, flow, when } from 'laymos/story';

export const choose = flow('Choose', { description: 'Chooses a value.' }, () =>
  Effect.gen(function* () {
    const value = yield* decision('Value', { description: 'Calculates a value.' }, true).pipe(
      when(true, { description: 'Uses the true value.' }, () => Effect.succeed(1)),
      exhaustive,
    );
    return value;
  }),
);

export const route = flow('Route', { description: 'Routes execution.' }, () =>
  decision('Route result', { description: 'Chooses the remaining path.' }, true).pipe(
    when(true, { description: 'Returns from this path.' }, () => Effect.succeed(1)),
    exhaustive,
  ),
);
`;

    expect(
      storyDecisionSourceRoles(source, 'roles.ts').map(({ role }) => role),
    ).toEqual(['value', 'control-flow']);
    expect(validateStoryAuthoringSource(source, 'roles.ts')).toEqual([]);
  });

  it('rejects leaked native control flow and invalid Arm outcomes', () => {
    const leakedBranch = `
import { Effect } from 'effect';
import { flow } from 'laymos/story';
export const route = flow('Route', { description: 'Routes.' }, (value: boolean) => {
  if (value) return Effect.succeed('yes');
  return Effect.succeed('no');
});
`;
    expect(
      validateStoryAuthoringSource(leakedBranch, 'leaked.ts')[0],
    ).toContain('Native branching inside a narrated Flow or Arm');

    const assignedCompletion = `
import { Effect } from 'effect';
import { decision, exhaustive, flow, when } from 'laymos/story';
export const choose = flow('Choose', { description: 'Chooses.' }, () =>
  Effect.gen(function* () {
    const value = yield* decision('Value', { description: 'Calculates.' }, true).pipe(
      when(true, { description: 'Selects.', completion: { kind: 'success' } }, () => Effect.succeed(1)),
      exhaustive,
    );
    return value;
  }),
);
`;
    expect(
      validateStoryAuthoringSource(assignedCompletion, 'assigned.ts')[0],
    ).toContain('Arms of assigned Decisions cannot declare completion');
  });
});

function locationOf(source: string, needle: string) {
  const index = source.indexOf(needle);
  const before = source.slice(0, index);
  const lines = before.split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

function projectionText(
  projection: ReturnType<typeof projectStorySource>['clean'],
  id: string,
) {
  const range = projection.ranges.find((candidate) => candidate.id === id)!;
  return projection.content
    .split('\n')
    .slice(range.startLine - 1, range.endLine)
    .join('\n');
}

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
      'export const work = Effect.void',
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
