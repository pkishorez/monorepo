import * as path from 'node:path';
import { describe, it, expect } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { findMonorepoRoot } from '../monorepo.js';
import { NotAMonorepoError } from '../types.js';

const fixtures = path.join(import.meta.dirname, 'fixtures');
const options = { stopAt: fixtures };

describe('findMonorepoRoot', () => {
  it.effect('finds pnpm workspace from pnpm-workspace.yaml', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'pnpm-monorepo'), options);

      expect(result.root).toBe(path.join(fixtures, 'pnpm-monorepo'));
      expect(result.packageManager).toBe('pnpm');
      expect(result.patterns).toContain(path.join('packages', '*', 'package.json'));
    })
  );

  it.effect('finds yarn workspace from package.json workspaces array', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'yarn-monorepo'), options);

      expect(result.root).toBe(path.join(fixtures, 'yarn-monorepo'));
      expect(result.packageManager).toBe('yarn');
      expect(result.patterns).toContain(path.join('packages', '*', 'package.json'));
    })
  );

  it.effect('finds workspace from package.json workspaces.packages', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'npm-monorepo'), options);

      expect(result.root).toBe(path.join(fixtures, 'npm-monorepo'));
      expect(result.packageManager).toBe('npm');
      expect(result.patterns).toContain(path.join('libs', '*', 'package.json'));
    })
  );

  it.effect('detects bun package manager', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'bun-monorepo'), options);

      expect(result.packageManager).toBe('bun');
    })
  );

  it.effect('falls back to single-repo when no workspaces found', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'single-repo'), options);

      expect(result.root).toBe(path.join(fixtures, 'single-repo'));
      expect(result.packageManager).toBe('pnpm');
      expect(result.patterns).toEqual(['./package.json']);
    })
  );

  it.effect('walks up directory tree to find root', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'nested', 'packages', 'app'), options);

      expect(result.root).toBe(path.join(fixtures, 'nested'));
    })
  );

  it.effect('fails with NotAMonorepoError when no package.json found', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        findMonorepoRoot(path.join(fixtures, 'empty-dir'), options)
      );

      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        const error = exit.cause;
        expect(error._tag).toBe('Fail');
        if (error._tag === 'Fail') {
          expect(error.error).toBeInstanceOf(NotAMonorepoError);
        }
      }
    })
  );

  it.effect('returns unknown package manager when no lock file found', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(path.join(fixtures, 'no-lockfile'), options);

      expect(result.packageManager).toBe('unknown');
    })
  );

  it.effect('respects stopAt boundary', () =>
    Effect.gen(function* () {
      const result = yield* findMonorepoRoot(
        path.join(fixtures, 'nested', 'packages', 'app'),
        { stopAt: path.join(fixtures, 'nested', 'packages') },
      );

      expect(result.root).toBe(path.join(fixtures, 'nested', 'packages', 'app'));
      expect(result.patterns).toEqual(['./package.json']);
    })
  );
});
