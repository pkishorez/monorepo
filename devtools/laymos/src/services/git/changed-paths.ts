import type {
  Branch,
  ChangedPath,
  ChangeSet,
  ChangeStatus,
  DiffHunk,
} from '../../change-set-schema/index.js';
import { parsePatch } from './parse-patch.js';
import { requireGit, runGit, splitNul } from './run-git.js';

const wholeFileContext = 1_000_000;

interface ChangeOrigin {
  status: ChangeStatus;
  committed: boolean;
  uncommitted: boolean;
}

export async function readChangeSet(
  baseDir: string,
  baseRef: string,
): Promise<ChangeSet> {
  await requireGit(baseDir, ['rev-parse', '--show-toplevel'], 'not-a-repo');
  const base = await resolveBase(baseDir, baseRef);
  const changed = new Map<string, ChangeOrigin>();

  // Committed work between the Base ref and HEAD. Empty when the Base ref is HEAD.
  if (base !== 'HEAD') {
    for (const [path, status] of await nameStatus(baseDir, [base, 'HEAD'])) {
      record(changed, path, status, 'committed');
    }
  }

  // Uncommitted work: the working tree against HEAD, plus untracked files.
  for (const [path, status] of await nameStatus(baseDir, ['HEAD'])) {
    record(changed, path, status, 'uncommitted');
  }
  const untracked = splitNul(
    await requireGit(
      baseDir,
      ['ls-files', '--others', '--exclude-standard', '-z'],
      'command-failed',
    ),
  );
  for (const path of untracked) {
    record(changed, path, 'added', 'uncommitted');
  }

  const files: ChangedPath[] = [...changed]
    .map(([path, origin]) => ({ path, ...origin }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return { baseRef: base, files };
}

async function nameStatus(
  baseDir: string,
  revisions: readonly string[],
): Promise<readonly (readonly [string, ChangeStatus])[]> {
  const output = splitNul(
    await requireGit(
      baseDir,
      [
        'diff',
        '--name-status',
        '--no-renames',
        '-z',
        '--relative',
        ...revisions,
      ],
      'command-failed',
    ),
  );
  const entries: (readonly [string, ChangeStatus])[] = [];
  for (let index = 0; index + 1 < output.length; index += 2) {
    const status = trackedStatus(output[index] ?? '');
    const path = output[index + 1];
    if (status !== undefined && path !== undefined)
      entries.push([path, status]);
  }
  return entries;
}

// A path added in one origin stays added overall, however the other touched it.
function record(
  changed: Map<string, ChangeOrigin>,
  path: string,
  status: ChangeStatus,
  origin: 'committed' | 'uncommitted',
): void {
  const current = changed.get(path);
  changed.set(path, {
    status:
      current?.status === 'added' || status === 'added' ? 'added' : status,
    committed: (current?.committed ?? false) || origin === 'committed',
    uncommitted: (current?.uncommitted ?? false) || origin === 'uncommitted',
  });
}

export async function readFileDiff(
  baseDir: string,
  baseRef: string,
  path: string,
): Promise<readonly DiffHunk[]> {
  const base = await resolveBase(baseDir, baseRef);
  const patch = await requireGit(
    baseDir,
    [
      'diff',
      '--no-renames',
      '--no-color',
      // Full context so one hunk carries the complete before and after file.
      `--unified=${wholeFileContext}`,
      base,
      '--',
      path,
    ],
    'command-failed',
  );
  return parsePatch(patch);
}

async function resolveBase(baseDir: string, baseRef: string): Promise<string> {
  if (baseRef === 'HEAD') return 'HEAD';
  const mergeBase = await requireGit(
    baseDir,
    ['merge-base', baseRef, 'HEAD'],
    'unknown-ref',
  );
  return mergeBase.trim();
}

export async function listBranches(baseDir: string): Promise<Branch[]> {
  await requireGit(baseDir, ['rev-parse', '--show-toplevel'], 'not-a-repo');
  const current = (
    await runGit(baseDir, ['symbolic-ref', '--short', 'HEAD'])
  ).stdout.trim();

  const local = splitLines(
    await requireGit(
      baseDir,
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads'],
      'command-failed',
    ),
  ).map((name) => ({ name, remote: false, current: name === current }));

  const remote = splitLines(
    await requireGit(
      baseDir,
      ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'],
      'command-failed',
    ),
  )
    .filter((name) => !name.endsWith('/HEAD'))
    .map((name) => ({ name, remote: true, current: false }));

  return [...local, ...remote];
}

function splitLines(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function trackedStatus(code: string): ChangeStatus | undefined {
  switch (code.charAt(0)) {
    case 'A':
      return 'added';
    case 'M':
    case 'T':
    case 'U':
      return 'modified';
    default:
      return undefined;
  }
}
