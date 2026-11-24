import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceOf } from '../cli/workspace.ts';

/* Which packages `monoverse lint` checks at a repository's root. */

const repo = (files: Readonly<Record<string, string>>) => {
  const root = mkdtempSync(join(tmpdir(), 'monoverse-workspace-'));
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(root, name), text);
  return workspaceOf(root);
};

const names = (isWorkspace: (pkg: string) => boolean) =>
  ['apps/web', 'libs/util', 'apps/web/test/fixtures/app'].filter(isWorkspace);

describe('workspaceOf', () => {
  it.each([
    ['indented items', 'packages:\n  - apps/*\n  - "libs/*"\n'],
    ['items at the left edge', 'packages:\n- apps/*\n- libs/*\n'],
    ['a flow list', 'packages: [apps/*, libs/*]\n'],
  ])('reads pnpm-workspace.yaml with %s', (_, yaml) => {
    expect(names(repo({ 'pnpm-workspace.yaml': yaml }))).toEqual([
      'apps/web',
      'libs/util',
    ]);
  });

  it('leaves out what a ! glob names', () => {
    expect(
      names(
        repo({ 'pnpm-workspace.yaml': "packages: ['apps/*', '!apps/web']\n" }),
      ),
    ).toEqual([]);
  });

  it('reads the workspaces of package.json, as a list or as yarn writes them', () => {
    expect(
      names(repo({ 'package.json': '{"workspaces":["libs/*"]}' })),
    ).toEqual(['libs/util']);
    expect(
      names(repo({ 'package.json': '{"workspaces":{"packages":["apps/*"]}}' })),
    ).toEqual(['apps/web']);
  });

  it.each([
    ['no workspace file', {}],
    ['no packages in it', { 'pnpm-workspace.yaml': 'catalog:\n  a: 1\n' }],
    ['an empty list', { 'pnpm-workspace.yaml': 'packages: []\n' }],
    ['YAML it cannot read', { 'pnpm-workspace.yaml': 'packages: [apps/*\n' }],
  ])('checks every package with %s, never none', (_, files) => {
    expect(names(repo(files))).toHaveLength(3);
  });
});
