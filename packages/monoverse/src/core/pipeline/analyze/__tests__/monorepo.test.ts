import * as path from 'node:path';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Exit } from 'effect';
import { findMonorepoRoot } from '../monorepo.js';
import { NotAMonorepoError } from '../types.js';

const fixtures = path.join(import.meta.dirname, 'fixtures');
const options = { stopAt: fixtures };

describe('findMonorepoRoot', () => {
  itEffect('finds pnpm workspace from pnpm-workspace.yaml', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'pnpm-monorepo'),
        options,
      );

      expect(result.root).toBe(path.join(fixtures, 'pnpm-monorepo'));
      expect(result.packageManager).toBe('pnpm');
      expect(result.patterns).toContain(
        path.join('packages', '*', 'package.json'),
      );
    }),
  );

  itEffect('finds yarn workspace from package.json workspaces array', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'yarn-monorepo'),
        options,
      );

      expect(result.root).toBe(path.join(fixtures, 'yarn-monorepo'));
      expect(result.packageManager).toBe('yarn');
      expect(result.patterns).toContain(
        path.join('packages', '*', 'package.json'),
      );
    }),
  );

  itEffect('finds workspace from package.json workspaces.packages', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'npm-monorepo'),
        options,
      );

      expect(result.root).toBe(path.join(fixtures, 'npm-monorepo'));
      expect(result.packageManager).toBe('npm');
      expect(result.patterns).toContain(path.join('libs', '*', 'package.json'));
    }),
  );

  itEffect('detects bun package manager', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'bun-monorepo'),
        options,
      );

      expect(result.packageManager).toBe('bun');
    }),
  );

  itEffect('falls back to single-repo when no workspaces found', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'single-repo'),
        options,
      );

      expect(result.root).toBe(path.join(fixtures, 'single-repo'));
      expect(result.packageManager).toBe('pnpm');
      expect(result.patterns).toEqual(['./package.json']);
    }),
  );

  itEffect('walks up directory tree to find root', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'nested', 'packages', 'app'),
        options,
      );

      expect(result.root).toBe(path.join(fixtures, 'nested'));
    }),
  );

  itEffect('fails with NotAMonorepoError when no package.json found', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        findMonorepoRoot(path.join(fixtures, 'empty-dir'), options),
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause;
        expect(error._tag).toBe('Fail');
        if (error._tag === 'Fail') {
          expect(error.error).toBeInstanceOf(NotAMonorepoError);
        }
      }
    }),
  );

  itEffect('returns unknown package manager when no lock file found', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'no-lockfile'),
        options,
      );

      expect(result.packageManager).toBe('unknown');
    }),
  );

  itEffect('respects stopAt boundary', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'nested', 'packages', 'app'),
        { stopAt: path.join(fixtures, 'nested', 'packages') },
      );

      expect(result.root).toBe(
        path.join(fixtures, 'nested', 'packages', 'app'),
      );
      expect(result.patterns).toEqual(['./package.json']);
    }),
  );
});
