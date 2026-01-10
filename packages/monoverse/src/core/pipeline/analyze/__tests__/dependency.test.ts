import { describe, it, expect } from '@effect/vitest';
import { parseDependencySource, parseDependencies } from '../dependency.js';

describe('parseDependencySource', () => {
  it('returns file for file: prefix', () => {
    expect(parseDependencySource('file:../local')).toBe('file');
    expect(parseDependencySource('file:./packages/lib')).toBe('file');
  });

  it('returns git for git protocols', () => {
    expect(parseDependencySource('git+https://github.com/user/repo')).toBe(
      'git',
    );
    expect(parseDependencySource('git://github.com/user/repo.git')).toBe('git');
    expect(parseDependencySource('github:user/repo')).toBe('git');
    expect(parseDependencySource('gitlab:user/repo')).toBe('git');
    expect(parseDependencySource('bitbucket:user/repo')).toBe('git');
  });

  it('returns url for http/https', () => {
    expect(parseDependencySource('http://example.com/pkg.tgz')).toBe('url');
    expect(parseDependencySource('https://example.com/pkg.tgz')).toBe('url');
  });

  it('returns npm for semver ranges and tags', () => {
    expect(parseDependencySource('^1.0.0')).toBe('npm');
    expect(parseDependencySource('~2.3.4')).toBe('npm');
    expect(parseDependencySource('1.0.0')).toBe('npm');
    expect(parseDependencySource('>=1.0.0 <2.0.0')).toBe('npm');
    expect(parseDependencySource('*')).toBe('npm');
    expect(parseDependencySource('latest')).toBe('npm');
    expect(parseDependencySource('next')).toBe('npm');
    expect(parseDependencySource('beta')).toBe('npm');
  });
});

describe('parseDependencies', () => {
  it('returns empty array for undefined deps', () => {
    expect(parseDependencies(undefined, 'dependency', new Set())).toEqual([]);
  });

  it('returns empty array for empty deps', () => {
    expect(parseDependencies({}, 'dependency', new Set())).toEqual([]);
  });

  it('parses npm dependencies', () => {
    const deps = { react: '^18.0.0', lodash: '4.17.21' };
    const result = parseDependencies(deps, 'dependency', new Set());

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'react',
      versionRange: '^18.0.0',
      dependencyType: 'dependency',
      source: 'npm',
    });
    expect(result[1]).toEqual({
      name: 'lodash',
      versionRange: '4.17.21',
      dependencyType: 'dependency',
      source: 'npm',
    });
  });

  it('marks workspace dependencies', () => {
    const deps = { '@internal/lib': 'workspace:*', 'react': '^18.0.0' };
    const workspaceNames = new Set(['@internal/lib']);
    const result = parseDependencies(deps, 'dependency', workspaceNames);

    expect(result[0]).toEqual({
      name: '@internal/lib',
      versionRange: 'workspace:*',
      dependencyType: 'dependency',
      source: 'workspace',
    });
    expect(result[1]!.source).toBe('npm');
  });

  it('preserves dependency type', () => {
    const deps = { typescript: '^5.0.0' };

    expect(
      parseDependencies(deps, 'devDependency', new Set())[0]!.dependencyType,
    ).toBe('devDependency');
    expect(
      parseDependencies(deps, 'peerDependency', new Set())[0]!.dependencyType,
    ).toBe('peerDependency');
    expect(
      parseDependencies(deps, 'optionalDependency', new Set())[0]!
        .dependencyType,
    ).toBe('optionalDependency');
  });
});
