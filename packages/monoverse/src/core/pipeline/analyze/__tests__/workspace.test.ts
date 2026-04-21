import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect } from 'effect';
import { discoverWorkspaces } from '../workspace.js';

const fixtures = path.join(import.meta.dirname, 'fixtures');

describe('discoverWorkspaces', () => {
  itEffect('discovers workspaces from glob patterns', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'pnpm-monorepo');
      const result = yield* discoverWorkspaces(root, [
        path.join('packages', '*', 'package.json'),
      ]);

      expect(result.workspaces).toHaveLength(2);
      expect(result.workspaces.map((w) => w.name).sort()).toEqual([
        '@repo/lib-a',
        '@repo/lib-b',
      ]);
      expect(result.errors).toHaveLength(0);
    }),
  );

  itEffect('parses workspace metadata', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'pnpm-monorepo');
      const result = yield* discoverWorkspaces(root, [
        path.join('packages', 'lib-a', 'package.json'),
      ]);

      const workspace = result.workspaces[0]!;
      expect(workspace.name).toBe('@repo/lib-a');
      expect(workspace.version).toBe('1.0.0');
      expect(workspace.path).toBe(path.join(root, 'packages', 'lib-a'));
      expect(workspace.private).toBe(false);
    }),
  );

  itEffect('collects all dependency types', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'with-all-dep-types');
      const result = yield* discoverWorkspaces(root, [
        path.join('app', 'package.json'),
      ]);

      const deps = result.workspaces[0]!.dependencies;
      expect(deps).toHaveLength(4);
      expect(deps.find((d) => d.name === 'react')!.dependencyType).toBe(
        'dependency',
      );
      expect(deps.find((d) => d.name === 'typescript')!.dependencyType).toBe(
        'devDependency',
      );
      expect(deps.find((d) => d.name === 'react-dom')!.dependencyType).toBe(
        'peerDependency',
      );
      expect(deps.find((d) => d.name === 'fsevents')!.dependencyType).toBe(
        'optionalDependency',
      );
    }),
  );

  itEffect('marks internal dependencies as workspace source', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'with-internal-deps');
      const result = yield* discoverWorkspaces(root, [
        path.join('packages', '*', 'package.json'),
      ]);

      const appDeps = result.workspaces.find(
        (w) => w.name === '@repo/app',
      )!.dependencies;
      expect(appDeps.find((d) => d.name === '@repo/lib')!.source).toBe(
        'workspace',
      );
      expect(appDeps.find((d) => d.name === 'react')!.source).toBe('npm');
    }),
  );

  itEffect('handles parse errors gracefully', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'with-invalid-json');
      const result = yield* discoverWorkspaces(root, [
        path.join('valid', 'package.json'),
        path.join('invalid', 'package.json'),
      ]);

      expect(result.workspaces).toHaveLength(1);
      expect(result.workspaces[0]!.name).toBe('valid');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.path).toContain('invalid');
    }),
  );

  itEffect('derives name from directory when missing', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'missing-fields');
      const result = yield* discoverWorkspaces(root, [
        path.join('pkg', 'package.json'),
      ]);

      expect(result.workspaces[0]!.name).toBe('pkg');
    }),
  );

  itEffect('defaults version to 0.0.0 when missing', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'missing-fields');
      const result = yield* discoverWorkspaces(root, [
        path.join('pkg', 'package.json'),
      ]);

      expect(result.workspaces[0]!.version).toBe('0.0.0');
    }),
  );

  itEffect('defaults private to false when missing', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'missing-fields');
      const result = yield* discoverWorkspaces(root, [
        path.join('pkg', 'package.json'),
      ]);

      expect(result.workspaces[0]!.private).toBe(false);
    }),
  );

  itEffect('returns empty workspaces when no matches found', () =>
    Effect.gen(function* () {
      const root = path.join(fixtures, 'empty-dir');
      const result = yield* discoverWorkspaces(root, [
        path.join('nonexistent', '*', 'package.json'),
      ]);

      expect(result.workspaces).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    }),
  );
});
