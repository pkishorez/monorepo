import { describe, it, expect, beforeEach, afterEach } from '@effect/vitest';
import { Effect } from 'effect';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Workspace } from '../../analyze/types.js';
import {
  upsertDependency,
  formatPackageJson,
  removeDependency,
} from '../index.js';

describe('upsertDependency', () => {
  let tempDir: string;
  let workspace: Workspace;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monoverse-test-'));
    workspace = {
      name: 'test-workspace',
      version: '1.0.0',
      path: tempDir,
      private: true,
      dependencies: [],
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it.effect('adds new dependency when not exists', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test' }, null, 2),
        ),
      );

      yield* upsertDependency({
        workspace,
        dependencyName: 'react',
        versionRange: '18.2.0',
        dependencyType: 'dependency',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.dependencies.react).toBe('18.2.0');
    }),
  );

  it.effect('updates existing dependency version', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ dependencies: { react: '^18.0.0' } }, null, 2),
        ),
      );

      yield* upsertDependency({
        workspace,
        dependencyName: 'react',
        versionRange: '18.2.0',
        dependencyType: 'dependency',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.dependencies.react).toBe('18.2.0');
    }),
  );

  it.effect('moves dependency to new section when type differs', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ devDependencies: { typescript: '5.0.0' } }, null, 2),
        ),
      );

      yield* upsertDependency({
        workspace,
        dependencyName: 'typescript',
        versionRange: '5.3.0',
        dependencyType: 'dependency',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.dependencies.typescript).toBe('5.3.0');
      expect(parsed.devDependencies).toBeUndefined();
    }),
  );

  it.effect('adds to devDependencies', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test' }, null, 2),
        ),
      );

      yield* upsertDependency({
        workspace,
        dependencyName: 'typescript',
        versionRange: '5.3.0',
        dependencyType: 'devDependency',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.devDependencies.typescript).toBe('5.3.0');
    }),
  );

  it.effect('adds to peerDependencies', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ name: 'test' }, null, 2),
        ),
      );

      yield* upsertDependency({
        workspace,
        dependencyName: 'react',
        versionRange: '>=18.0.0',
        dependencyType: 'peerDependency',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.peerDependencies.react).toBe('>=18.0.0');
    }),
  );
});

describe('formatPackageJson', () => {
  let tempDir: string;
  let workspace: Workspace;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monoverse-test-'));
    workspace = {
      name: 'test-workspace',
      version: '1.0.0',
      path: tempDir,
      private: true,
      dependencies: [],
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it.effect('sorts package.json keys', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify(
            { dependencies: {}, name: 'test', version: '1.0.0' },
            null,
            2,
          ),
        ),
      );

      yield* formatPackageJson(workspace);

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const keys = Object.keys(JSON.parse(content));
      expect(keys[0]).toBe('name');
      expect(keys[1]).toBe('version');
    }),
  );

  it.effect('does not write if already sorted', () =>
    Effect.gen(function* () {
      const original =
        JSON.stringify(
          { name: 'test', version: '1.0.0', dependencies: {} },
          null,
          2,
        ) + '\n';
      yield* Effect.promise(() =>
        fs.writeFile(path.join(tempDir, 'package.json'), original),
      );

      const statBefore = yield* Effect.promise(() =>
        fs.stat(path.join(tempDir, 'package.json')),
      );

      yield* formatPackageJson(workspace);

      const statAfter = yield* Effect.promise(() =>
        fs.stat(path.join(tempDir, 'package.json')),
      );
      expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
    }),
  );
});

describe('removeDependency', () => {
  let tempDir: string;
  let workspace: Workspace;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monoverse-test-'));
    workspace = {
      name: 'test-workspace',
      version: '1.0.0',
      path: tempDir,
      private: true,
      dependencies: [],
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  it.effect('removes dependency from dependencies', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify(
            { dependencies: { react: '18.0.0', lodash: '4.17.0' } },
            null,
            2,
          ),
        ),
      );

      yield* removeDependency({
        workspace,
        dependencyName: 'react',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.dependencies.react).toBeUndefined();
      expect(parsed.dependencies.lodash).toBe('4.17.0');
    }),
  );

  it.effect('removes empty dependency object', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ dependencies: { react: '18.0.0' } }, null, 2),
        ),
      );

      yield* removeDependency({
        workspace,
        dependencyName: 'react',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.dependencies).toBeUndefined();
    }),
  );

  it.effect('fails for missing dependency', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify({ dependencies: {} }, null, 2),
        ),
      );

      const error = yield* removeDependency({
        workspace,
        dependencyName: 'nonexistent',
      }).pipe(Effect.flip);

      expect(error._tag).toBe('DependencyNotFoundError');
    }),
  );

  it.effect('removes from all dependency sections', () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          path.join(tempDir, 'package.json'),
          JSON.stringify(
            {
              dependencies: { lodash: '4.17.0' },
              devDependencies: { lodash: '4.18.0' },
            },
            null,
            2,
          ),
        ),
      );

      yield* removeDependency({
        workspace,
        dependencyName: 'lodash',
      });

      const content = yield* Effect.promise(() =>
        fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'),
      );
      const parsed = JSON.parse(content);
      expect(parsed.dependencies).toBeUndefined();
      expect(parsed.devDependencies).toBeUndefined();
    }),
  );
});
