import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const cli = fileURLToPath(new URL('../cli/main.ts', import.meta.url));
const fixtures = fileURLToPath(new URL('../../test/fixtures', import.meta.url));
let repo = '';

const write = (path: string, text: string) => {
  mkdirSync(join(repo, path, '..'), { recursive: true });
  writeFileSync(join(repo, path), text);
};

const runWith = (env: NodeJS.ProcessEnv, cwd: string, ...args: string[]) => {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [cli, ...args],
    { cwd: join(repo, cwd), encoding: 'utf8', env },
  );
  return { status, out: stdout + stderr };
};

const run = (cwd: string, ...args: string[]) =>
  runWith(process.env, cwd, ...args);

const lint = (cwd: string, ...flags: string[]) => run(cwd, 'lint', ...flags);

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'monoverse-cli-'));
  write(
    'package.json',
    JSON.stringify({ name: 'repo', workspaces: ['packages/*'] }),
  );
  for (const name of ['app', 'bare', 'invalid'])
    cpSync(join(fixtures, name), join(repo, 'packages', name), {
      recursive: true,
    });
  cpSync(join(fixtures, 'app'), join(repo, 'extra/app'), { recursive: true });
  write('packages/clean/package.json', '{ "name": "clean" }');
  write(
    'packages/clean/monoverse.json',
    '{ "sourceRoots": ["src"], "preset": "default" }',
  );
  write('packages/clean/src/a/index.ts', 'export const a = 1;\n');
  write(
    'packages/clean/src/start.ts',
    "import { a } from './a/index.ts';\nexport const start = a;\n",
  );
  execFileSync('git', ['init', '-q'], { cwd: repo });
});

describe('monoverse lint', () => {
  it('at the root, checks every workspace package with a monoverse.json, and fails', () => {
    const { status, out } = lint('');
    expect(status).toBe(1);
    expect(out).toContain(
      "packages/app/src/start.ts:4:24  './feature/actor-feature/logic/shape.ts' reaches inside",
    );
    expect(out).toContain(
      'packages/invalid/monoverse.json:1:1  monoverse.json needs exactly one of "preset" and "rules".',
    );
    expect(out).not.toContain('extra/app');
    expect(out).toMatch(/monoverse: \d+ problems in 2 of 3 packages\.\n$/);
  });

  it('inside a package, checks only it, with paths from where it runs', () => {
    expect(lint('packages/clean/src')).toEqual({
      status: 0,
      out: 'monoverse: checked 1 package, no problems.\n',
    });
    const { status, out } = lint('packages/app');
    expect(status).toBe(1);
    expect(out).toContain('\n  src/start.ts:4:24  ');
    expect(out).not.toContain('invalid');
  });

  it('inside a git hook, which sets GIT_DIR without GIT_WORK_TREE, still finds the repository from where it runs', () => {
    const { GIT_WORK_TREE: _, ...env } = process.env;
    expect(
      runWith(
        { ...env, GIT_DIR: join(repo, '.git') },
        'packages/clean/src',
        'lint',
      ),
    ).toEqual({
      status: 0,
      out: 'monoverse: checked 1 package, no problems.\n',
    });
  });

  it('says so when the package has no monoverse.json', () => {
    expect(lint('packages/bare')).toEqual({
      status: 0,
      out: 'monoverse: packages/bare has no monoverse.json, so nothing is checked.\n',
    });
  });

  it('with --staged, checks only the packages holding a staged file, as staged', () => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo });
    expect(lint('', '--staged')).toEqual({
      status: 0,
      out: 'monoverse: no staged file is in a package with a monoverse.json.\n',
    });
    git('add', 'package.json', 'packages/clean');
    expect(lint('', '--staged')).toEqual({
      status: 0,
      out: 'monoverse: checked 1 package, no problems.\n',
    });

    const good = "import { a } from './a/index.ts';\nexport const start = a;\n";
    const bad = "import { a } from './a/part.ts';\nexport const start = a;\n";
    write('packages/clean/src/a/part.ts', 'export const a = 1;\n');
    git('add', 'packages/clean/src/a/part.ts');
    write('packages/clean/src/start.ts', bad);
    expect(lint('', '--staged').status).toBe(0);

    git('add', 'packages/clean/src/start.ts');
    write('packages/clean/src/start.ts', good);
    const { status, out } = lint('', '--staged');
    expect(status).toBe(1);
    expect(out).toContain(
      "packages/clean/src/start.ts:1:19  './a/part.ts' reaches inside src/a.",
    );
    git('add', 'packages/clean/src/start.ts');
  });

  it('with --staged, checks both packages of a file moved from one to the other', () => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo });
    write('packages/other/package.json', '{ "name": "other" }');
    write(
      'packages/other/monoverse.json',
      '{ "sourceRoots": ["src"], "preset": "default" }',
    );
    git('add', 'packages/other');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
    git('mv', 'packages/clean/src/a/part.ts', 'packages/other/part.ts');
    expect(lint('', '--staged')).toEqual({
      status: 0,
      out: 'monoverse: checked 2 packages, no problems.\n',
    });
  });

  it('refuses a command it does not know', () => {
    expect(run('', 'check').status).toBe(2);
    expect(lint('', '--fix').status).toBe(2);
  });
});
