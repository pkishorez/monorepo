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
  test('reads and decodes a valid config', async () => {
    const config = await readFixture('valid.json');

    expect(config.sourceRoots).toEqual(['src']);
    expect(config.layers.app).toEqual({
      paths: ['src/app'],
      description: 'Application',
    });
    expect(config.layerGraphs.architecture?.rules).toEqual({
      app: ['domain'],
    });
  });

  test('fails with reason "read" for a missing file', async () => {
    const error = await readFixtureError('missing.json');

    expect(error.reason).toBe('read');
  });

  test('fails with reason "parse" for invalid JSON', async () => {
    const error = await readFixtureError('invalid-json.txt');

    expect(error.reason).toBe('parse');
  });

  test('fails with reason "schema" when layerGraphs is empty', async () => {
    const error = await readFixtureError('invalid-schema.json');

    expect(error.reason).toBe('schema');
  });
});

describe('ConfigService.jsonSchema', () => {
  test('describes the config shape', () => {
    const schema = ConfigService.jsonSchema();

    expect(schema.schema.required).toEqual(
      expect.arrayContaining(['sourceRoots', 'layers', 'layerGraphs']),
    );
  });

  test('matches the published schema snapshot', () => {
    expect(ConfigService.jsonSchema()).toMatchSnapshot();
  });
});
