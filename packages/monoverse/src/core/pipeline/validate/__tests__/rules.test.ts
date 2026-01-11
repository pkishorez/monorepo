import { describe, it, expect } from '@effect/vitest';
import { Effect } from 'effect';
import type { ProjectAnalysis } from '../../analyze/types.js';
import {
  groupDependenciesByPackage,
  detectUnpinnedVersions,
  detectVersionMismatches,
  detectFormatPackageJson,
} from '../index.js';

function createAnalysis(
  workspaces: ProjectAnalysis['workspaces'],
): ProjectAnalysis {
  return {
    root: '/test',
    workspaces,
    errors: [],
  };
}

describe('groupDependenciesByPackage', () => {
  it.effect('groups dependencies by package name', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app-a',
          version: '1.0.0',
          path: '/test/apps/a/package.json',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
        {
          name: 'app-b',
          version: '1.0.0',
          path: '/test/apps/b/package.json',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const result = yield* Effect.sync(() => groupDependenciesByPackage(analysis));

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('react');
      expect(result[0]!.instances).toHaveLength(2);
    }),
  );

  it.effect('filters by source', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/test/app/package.json',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
            {
              name: '@internal/lib',
              versionRange: 'workspace:*',
              dependencyType: 'dependency',
              source: 'workspace',
            },
          ],
        },
      ]);

      const npmOnly = yield* Effect.sync(() =>
        groupDependenciesByPackage(analysis, ['npm']),
      );
      expect(npmOnly).toHaveLength(1);
      expect(npmOnly[0]!.name).toBe('react');

      const workspaceOnly = yield* Effect.sync(() =>
        groupDependenciesByPackage(analysis, ['workspace']),
      );
      expect(workspaceOnly).toHaveLength(1);
      expect(workspaceOnly[0]!.name).toBe('@internal/lib');
    }),
  );
});

describe('detectUnpinnedVersions', () => {
  it.effect('detects caret ranges', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/test/app',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '^18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectUnpinnedVersions(analysis);

      expect(violations).toHaveLength(1);
      expect(violations[0]!._tag).toBe('ViolationUnpinnedVersion');
      expect(violations[0]!.package).toBe('react');
    }),
  );

  it.effect('detects tilde ranges', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/test/app',
          private: true,
          dependencies: [
            {
              name: 'lodash',
              versionRange: '~4.17.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectUnpinnedVersions(analysis);

      expect(violations).toHaveLength(1);
      expect(violations[0]!.package).toBe('lodash');
    }),
  );

  it.effect('detects wildcards', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/test/app',
          private: true,
          dependencies: [
            {
              name: 'typescript',
              versionRange: '5.x',
              dependencyType: 'devDependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectUnpinnedVersions(analysis);

      expect(violations).toHaveLength(1);
    }),
  );

  it.effect('allows pinned versions', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/test/app',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.2.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectUnpinnedVersions(analysis);

      expect(violations).toHaveLength(0);
    }),
  );
});

describe('detectVersionMismatches', () => {
  it.effect('detects different versions across workspaces', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app-a',
          version: '1.0.0',
          path: '/test/apps/a',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
        {
          name: 'app-b',
          version: '1.0.0',
          path: '/test/apps/b',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '17.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectVersionMismatches(analysis);

      expect(violations).toHaveLength(2);
      expect(violations[0]!._tag).toBe('ViolationVersionMismatch');
      expect(violations[0]!.package).toBe('react');
    }),
  );

  it.effect('ignores packages with same version', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app-a',
          version: '1.0.0',
          path: '/test/apps/a',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
        {
          name: 'app-b',
          version: '1.0.0',
          path: '/test/apps/b',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectVersionMismatches(analysis);

      expect(violations).toHaveLength(0);
    }),
  );

  it.effect('ignores packages used in only one workspace', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/test/app',
          private: true,
          dependencies: [
            {
              name: 'react',
              versionRange: '18.0.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectVersionMismatches(analysis);

      expect(violations).toHaveLength(0);
    }),
  );

  it.effect('includes all versions in details', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app-a',
          version: '1.0.0',
          path: '/test/apps/a',
          private: true,
          dependencies: [
            {
              name: 'lodash',
              versionRange: '4.17.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
        {
          name: 'app-b',
          version: '1.0.0',
          path: '/test/apps/b',
          private: true,
          dependencies: [
            {
              name: 'lodash',
              versionRange: '4.18.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
        {
          name: 'app-c',
          version: '1.0.0',
          path: '/test/apps/c',
          private: true,
          dependencies: [
            {
              name: 'lodash',
              versionRange: '4.19.0',
              dependencyType: 'dependency',
              source: 'npm',
            },
          ],
        },
      ]);

      const violations = yield* detectVersionMismatches(analysis);

      expect(violations).toHaveLength(3);
      expect(violations[0]!.allVersions).toHaveLength(3);
    }),
  );
});

describe('detectFormatPackageJson', () => {
  it.effect('returns empty for non-existent paths', () =>
    Effect.gen(function* () {
      const analysis = createAnalysis([
        {
          name: 'app',
          version: '1.0.0',
          path: '/non-existent-path',
          private: true,
          dependencies: [],
        },
      ]);

      const violations = yield* detectFormatPackageJson(analysis);

      expect(violations).toHaveLength(0);
    }),
  );
});
