import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type Fixture = {
  readonly repo: string;
  readonly worktree: string;
  readonly git: (cwd: string, ...args: Array<string>) => string;
  readonly write: (path: string, content: string) => Promise<void>;
};

export const mainFiles: Readonly<Record<string, string>> = {
  'package.json': '{"name":"fixture","private":true}\n',
  'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
  'README.md': '# Fixture\n',
  'packages/core/package.json': '{"name":"core"}\n',
  'packages/core/src/index.ts': "export * from './util.js';\n",
  'packages/core/src/util.ts': 'export const util = 1;\n',
};

export async function withFixture<A>(
  use: (fixture: Fixture) => Promise<A>,
): Promise<A> {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), 'monoverse-fixture-')),
  );
  const repo = join(parent, 'repo');
  const worktree = join(parent, 'worktree');
  const git = (cwd: string, ...args: Array<string>) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  const write = async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  };
  try {
    await mkdir(repo);
    git(repo, 'init', '-q', '--initial-branch=main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    for (const [path, content] of Object.entries(mainFiles))
      await write(join(repo, path), content);
    git(repo, 'add', '--all');
    git(repo, 'commit', '-q', '-m', 'main');

    git(repo, 'checkout', '-q', '-b', 'feature');
    await write(
      join(repo, 'packages/core/src/feature.ts'),
      "import { util } from './util.js';\nexport const feature = util;\n",
    );
    await write(
      join(repo, 'packages/core/src/index.ts'),
      "export * from './util.js';\nexport * from './feature.js';\n",
    );
    await write(join(repo, 'README.md'), '# Fixture\n\nOn feature.\n');
    git(repo, 'add', '--all');
    git(repo, 'commit', '-q', '-m', 'feature');
    git(repo, 'checkout', '-q', 'main');

    git(repo, 'worktree', 'add', '-q', '-b', 'wip', worktree);
    await write(
      join(worktree, 'README.md'),
      '# Fixture\n\nWork in progress.\n',
    );
    await write(join(worktree, 'packages/core/src/draft.ts'), 'export {};\n');

    return await use({ repo, worktree, git, write });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}
