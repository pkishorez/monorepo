import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

import type { SnapshotEntry } from './comment.ts';

export interface DrawOptions {
  readonly base: string;
  readonly theme: 'dark' | 'light' | 'both';
  readonly onlyChanged: boolean;
  readonly includeUnchanged: boolean;
  readonly devtoolsVersion: string;
  readonly devtoolsBin: string;
  readonly browser: string;
}

export interface Drawing {
  readonly entries: readonly SnapshotEntry[];
  readonly base: string;
  readonly failed: boolean;
}

export function draw(options: DrawOptions): Drawing {
  const base = fetchBase(options.base);
  const args = [
    ...['snapshot', '--all', '--base', base],
    ...['--theme', options.theme],
    ...['--out-dir', join(process.env.RUNNER_TEMP ?? '.', 'laymos')],
    ...(options.onlyChanged ? ['--only-changed'] : []),
    ...(options.includeUnchanged ? ['--include-unchanged'] : []),
  ];
  const [command, commandArgs] =
    options.devtoolsBin !== ''
      ? ['node', [options.devtoolsBin, ...args]]
      : [
          'npx',
          [
            '--yes',
            '-p',
            `@pkishorez/devtools@${options.devtoolsVersion}`,
            '-p',
            'playwright-core',
            'devtools',
            ...args,
          ],
        ];
  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      ...(options.browser === '' ? {} : { DEVTOOLS_BROWSER: options.browser }),
    },
  });
  console.log(result.stdout);
  return {
    entries: parseEntries(result.stdout),
    base,
    failed: result.status !== 0,
  };
}

function fetchBase(branch: string) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' }).trim();
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    git('fetch', '--no-tags', '--quiet', '--unshallow', 'origin');
  }
  git(
    'fetch',
    '--no-tags',
    '--quiet',
    'origin',
    `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
  );
  return `origin/${branch}`;
}

function parseEntries(stdout: string): SnapshotEntry[] {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('devtools snapshot printed no result; see the log above.');
  }
}
