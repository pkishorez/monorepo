import { existsSync } from 'node:fs';
import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Effect } from 'effect';
import type { RunSpec } from '../shared/contracts/run/index.ts';
import { CommandFailed, runCommand } from './processes.ts';

/*
 * The run's checkout: the one commit of the repository, fetched with the
 * token minted for this run, and its dependencies installed. The token is
 * sent as a header on the fetch alone; it is never written to the
 * checkout's git config, nor to the log.
 */

type Line = (line: string) => void;

/** The install a lockfile implies, from the folder up to the repository's root. */
export const installFor = (root: string, folder: string) => {
  let dir = folder;
  while (true) {
    const has = (name: string) => existsSync(path.join(dir, name));
    if (has('pnpm-lock.yaml'))
      return {
        cwd: dir,
        command: 'pnpm',
        args: ['install', '--frozen-lockfile'],
      };
    if (has('bun.lock') || has('bun.lockb'))
      return {
        cwd: dir,
        command: 'bun',
        args: ['install', '--frozen-lockfile'],
      };
    if (has('yarn.lock'))
      return {
        cwd: dir,
        command: 'yarn',
        args: has('.yarnrc.yml')
          ? ['install', '--immutable']
          : ['install', '--frozen-lockfile'],
      };
    if (has('package-lock.json') || has('npm-shrinkwrap.json'))
      return { cwd: dir, command: 'npm', args: ['ci'] };
    if (dir === root || path.dirname(dir) === dir) break;
    dir = path.dirname(dir);
  }
  return { cwd: folder, command: 'npm', args: ['install'] };
};

export const checkout = (options: {
  readonly spec: RunSpec;
  readonly dir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly onLine: Line;
}) =>
  Effect.gen(function* () {
    const { spec, dir, env, onLine } = options;
    yield* Effect.promise(() => mkdir(dir, { recursive: true }));
    const git = (args: ReadonlyArray<string>, failure: string) =>
      runCommand({ command: 'git', args, cwd: dir, env, onLine, failure });
    const basic = Buffer.from(`x-access-token:${spec.githubToken}`).toString(
      'base64',
    );
    onLine(`Fetching ${spec.repo} at ${spec.commit}`);
    yield* git(['init', '--quiet'], 'git init failed');
    yield* git(
      [
        '-c',
        `http.extraHeader=Authorization: Basic ${basic}`,
        'fetch',
        '--quiet',
        '--depth',
        '1',
        `https://github.com/${spec.repo}.git`,
        spec.commit,
      ],
      `Couldn’t fetch ${spec.commit} of ${spec.repo}`,
    );
    yield* git(['checkout', '--quiet', 'FETCH_HEAD'], 'git checkout failed');
    const root = yield* Effect.promise(() => realpath(dir));
    const folder = path.resolve(root, spec.folder);
    const real = yield* Effect.tryPromise({
      try: () => realpath(folder),
      catch: () =>
        new CommandFailed(`The folder ${spec.folder} isn’t in this commit.`),
    });
    if (real !== root && !real.startsWith(`${root}${path.sep}`))
      return yield* Effect.fail(
        new CommandFailed('The folder must be inside the repository.'),
      );
    if (!existsSync(path.join(real, spec.entrypoint)))
      return yield* Effect.fail(
        new CommandFailed(
          `There is no ${spec.entrypoint} in ${spec.folder} at this commit.`,
        ),
      );
    return { root, folder: real };
  });

export const setup = (options: {
  readonly spec: RunSpec;
  readonly root: string;
  readonly folder: string;
  readonly env: NodeJS.ProcessEnv;
  readonly onLine: Line;
}) => {
  const { spec, root, folder, env, onLine } = options;
  if (spec.setupCommand !== null) {
    onLine(`$ ${spec.setupCommand}`);
    return runCommand({
      command: spec.setupCommand,
      args: [],
      cwd: folder,
      env,
      onLine,
      shell: true,
      failure: 'The setup command failed',
    });
  }
  const install = installFor(root, folder);
  onLine(`$ ${[install.command, ...install.args].join(' ')}`);
  return runCommand({
    ...install,
    env,
    onLine,
    failure: 'Installing dependencies failed',
  });
};
