import { fileURLToPath } from 'node:url';

import * as NodeServices from '@effect/platform-node/NodeServices';
import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { ConfigService, ConfigServiceLive } from '../index.js';

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function readFixture(name: string) {
  return Effect.gen(function* () {
    const config = yield* ConfigService;
    return yield* config.read(fixture(name));
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
    Effect.runPromise,
  );
}

function readFixtureError(name: string) {
  return Effect.gen(function* () {
    const config = yield* ConfigService;
    return yield* config.read(fixture(name));
  }).pipe(
    Effect.provide(ConfigServiceLive),
    Effect.provide(NodeServices.layer),
    Effect.flip,
    Effect.runPromise,
  );
}

describe('ConfigService', () => {
  test('reads and decodes a valid config, filling the defaults', async () => {
    const config = await readFixture('valid.json');

    expect(config.sourceRoots).toEqual(['src']);
    expect(config.ignoredPaths).toEqual([]);
    expect(config.fileModules).toEqual(['src/core/ids.ts']);
    expect(config.rules).toEqual({
      'src/app': ['src/domain'],
      '*': ['src/core'],
    });
    expect(config.exceptions).toEqual([
      { from: 'src/infra', to: 'src', because: 'boots the app' },
    ]);
  });

  test('fails with reason "read" for a missing file', async () => {
    const error = await readFixtureError('missing.json');

    expect(error.reason).toBe('read');
  });

  test('fails with reason "parse" for invalid JSON', async () => {
    const error = await readFixtureError('invalid-json.txt');

    expect(error.reason).toBe('parse');
  });

  test('fails with reason "schema" when sourceRoots is empty', async () => {
    const error = await readFixtureError('invalid-schema.json');

    expect(error.reason).toBe('schema');
  });

  test('collects every path that is not canonical', async () => {
    const error = await readFixtureError('invalid-paths.json');

    expect(error.reason).toBe('validation');
    expect(error.issues.map((issue) => issue.kind)).toEqual(
      Array.from({ length: 6 }, () => 'path'),
    );
    expect(error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'sourceRoots[0] must be a canonical project-relative path: "src/"',
        'fileModules[0] must be a canonical project-relative path: "../ids.ts"',
        'rules must be a canonical project-relative path: "/app"',
        'exceptions[0].to must be a canonical project-relative path: "src/.."',
      ]),
    );
  });

  test('rejects Rules the tree could never hold and doubled Exceptions', async () => {
    const error = await readFixtureError('invalid-rules.json');

    expect(error.issues).toEqual([
      {
        kind: 'rule',
        message: 'Rule src/app -> *: "*" may only name a Rule\'s source',
      },
      {
        kind: 'rule',
        message:
          'Rule src/app/screens -> src/app: a Module never imports an ancestor; only an Exception with a Reason may',
      },
      {
        kind: 'rule',
        message:
          "Rule src -> src/app: a Module's own files already import every Module nested below it",
      },
      {
        kind: 'exception',
        message:
          'Exception src/a -> src/a: a Module is always free to import itself',
      },
      {
        kind: 'exception',
        message: 'Exception src/a -> src/b is declared twice',
      },
    ]);
  });
});

describe('ConfigService.jsonSchema', () => {
  test('describes the config shape', () => {
    const schema = ConfigService.jsonSchema();

    expect(schema.required).toEqual(['sourceRoots']);
  });

  test('matches the published schema snapshot', async () => {
    const schema = `${JSON.stringify(ConfigService.jsonSchema(), null, 2)}\n`;

    await expect(schema).toMatchFileSnapshot('../../../../schema.json');
  });
});
