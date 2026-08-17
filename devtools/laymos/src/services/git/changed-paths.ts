import type {
  ChangedPath,
  ChangeSet,
  ChangeStatus,
  DiffHunk,
} from '../../change-set-schema/index.js';
import { parsePatch } from './parse-patch.js';
import { requireGit, splitNul } from './run-git.js';

const wholeFileContext = 1_000_000;

export async function readChangeSet(
  baseDir: string,
  baseRef: string,
): Promise<ChangeSet> {
  await requireGit(baseDir, ['rev-parse', '--show-toplevel'], 'not-a-repo');
  const base = await resolveBase(baseDir, baseRef);
  const changed = new Map<string, ChangeStatus>();

  const nameStatus = splitNul(
    await requireGit(
      baseDir,
      ['diff', '--name-status', '--no-renames', '-z', '--relative', base],
      'command-failed',
    ),
  );
  for (let index = 0; index + 1 < nameStatus.length; index += 2) {
    const status = trackedStatus(nameStatus[index] ?? '');
    const path = nameStatus[index + 1];
    if (status !== undefined && path !== undefined) changed.set(path, status);
  }

  const untracked = splitNul(
    await requireGit(
      baseDir,
      ['ls-files', '--others', '--exclude-standard', '-z'],
      'command-failed',
    ),
  );
  for (const path of untracked) changed.set(path, 'added');

  const files: ChangedPath[] = [...changed]
    .map(([path, status]) => ({ path, status }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return { baseRef: base, files };
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
