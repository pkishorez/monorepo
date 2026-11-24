import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/*
 * A commit's files written to a folder on disk, for what reads the disk
 * itself: the whole commit, one folder per commit, under a folder of
 * copies. A copy is written under a temporary name, a marker last, and
 * renamed when whole, so a half-written one is never read. A commit never
 * changes, so a copy is kept and reused while its marker and its files
 * are all there (the OS may clear its temp folder file by file: every
 * file is looked for once per process, the marker after that), and only
 * the few used last stay. A symbolic link in the commit is one in the
 * copy. The checkout's node_modules, the repository's and each Package's,
 * are linked in, so a tsconfig that extends an installed one reads as it
 * does on disk; on every open, one missing or pointing at nothing is
 * linked again.
 */

/** Where the copies live, unless told otherwise. */
export const copiesFolder = join(tmpdir(), 'kestack-devtools', 'monoverse');

/** How many copies stay, the ones used last. */
const keptCopies = 6;

/** A temporary folder left this long is a write that died. */
const abandonedAfter = 60 * 60 * 1000;

/** Files written, or looked for, at once. */
const concurrency = 32;

/** Files read from git at once. */
const batch = 500;

/** Written last into a whole copy: its commit and how many files it holds. */
const marker = '.kestack-devtools-copy.json';

/** Copies being written now, by folder, so two opens write one. */
const writing = new Map<string, Promise<string>>();

/** Copies found whole, every file there, since this process started. */
const whole = new Set<string>();

/** One file of the commit, by its path from the repository's top. */
export interface CopiedFile {
  readonly path: string;
  /** A symbolic link, whose contents are where it points. */
  readonly link: boolean;
}

export interface CommitCopy {
  /** The folder the copies live in. */
  readonly copies: string;
  readonly commit: string;
  /** The worktree on disk whose node_modules are linked in. */
  readonly checkout: string;
  /** Every file of the commit. */
  readonly list: () => Promise<ReadonlyArray<CopiedFile>>;
  readonly readMany: (
    paths: ReadonlyArray<string>,
  ) => Promise<ReadonlyMap<string, Uint8Array>>;
}

/** The folder holding the whole commit, written now unless a whole copy is kept. */
export function commitFolder(copy: CommitCopy): Promise<string> {
  const folder = join(copy.copies, copy.commit);
  const kept = writing.get(folder);
  if (kept !== undefined) return kept;
  const work = ensure(copy, folder).finally(() => writing.delete(folder));
  writing.set(folder, work);
  return work;
}

async function ensure(copy: CommitCopy, folder: string): Promise<string> {
  const files = await copy.list();
  if (await isDirectory(folder)) {
    if (await isWhole(folder, copy.commit, files)) {
      await linkInstalled(copy, files, folder);
      const now = new Date();
      await utimes(folder, now, now);
      return folder;
    }
    whole.delete(folder);
    await rm(folder, { recursive: true, force: true });
  }
  await mkdir(copy.copies, { recursive: true });
  const temp = await mkdtemp(join(copy.copies, `.${copy.commit}-`));
  try {
    await write(copy, files, temp);
    await rename(temp, folder);
    whole.add(folder);
  } catch (cause) {
    await rm(temp, { recursive: true, force: true });
    // Another process wrote it first: theirs is as good.
    if (!(await isWhole(folder, copy.commit, files))) throw cause;
  }
  await prune(copy.copies, folder);
  return folder;
}

/** Whether the copy at `folder` is whole: its marker says so, and every file is there. */
async function isWhole(
  folder: string,
  commit: string,
  files: ReadonlyArray<CopiedFile>,
): Promise<boolean> {
  let said: unknown;
  try {
    said = JSON.parse(await readFile(join(folder, marker), 'utf8'));
  } catch {
    return false;
  }
  if (
    typeof said !== 'object' ||
    said === null ||
    !('commit' in said) ||
    !('files' in said) ||
    said.commit !== commit ||
    said.files !== files.length
  )
    return false;
  if (whole.has(folder)) return true;
  let found = true;
  await each(files, async ({ path }) => {
    if (found && !(await exists(join(folder, path)))) found = false;
  });
  if (found) whole.add(folder);
  return found;
}

async function write(
  copy: CommitCopy,
  files: ReadonlyArray<CopiedFile>,
  temp: string,
): Promise<void> {
  for (let start = 0; start < files.length; start += batch) {
    const chunk = files.slice(start, start + batch);
    const contents = await copy.readMany(chunk.map(({ path }) => path));
    for (const folder of new Set(chunk.map(({ path }) => dirname(path))))
      await mkdir(join(temp, folder), { recursive: true });
    await each(chunk, async ({ path, link }) => {
      const bytes = contents.get(path);
      if (bytes === undefined) return;
      if (link)
        await symlink(new TextDecoder().decode(bytes), join(temp, path));
      else await writeFile(join(temp, path), bytes);
    });
  }
  await linkInstalled(copy, files, temp);
  await writeFile(
    join(temp, marker),
    JSON.stringify({ commit: copy.commit, files: files.length }),
  );
}

/**
 * Links the checkout's node_modules into the copy at `folder`, the
 * repository's and each Package's, where the checkout has one and the
 * copy has none, or a link that points at nothing: written before an
 * install, or from a worktree since removed.
 */
async function linkInstalled(
  copy: CommitCopy,
  files: ReadonlyArray<CopiedFile>,
  folder: string,
): Promise<void> {
  const packages = files
    .filter(
      ({ path }) => path === 'package.json' || path.endsWith('/package.json'),
    )
    .map(({ path }) => dirname(path));
  for (const at of new Set(['.', ...packages])) {
    const installed = join(copy.checkout, at, 'node_modules');
    const link = join(folder, at, 'node_modules');
    if (!(await isDirectory(installed)) || (await isDirectory(link))) continue;
    // A link that points at nothing.
    if (await exists(link)) await rm(link, { force: true });
    try {
      await symlink(installed, link, 'dir');
    } catch (cause) {
      // Another open linked it first.
      if (!isCode(cause, 'EEXIST')) throw cause;
    }
  }
}

/**
 * Keeps the copies used last, `current` always, and removes the rest and
 * any write that died. Removing a copy removes its links, never what they
 * point to.
 */
async function prune(copies: string, current: string): Promise<void> {
  const entries = await readdir(copies, { withFileTypes: true });
  const found: Array<{ readonly path: string; readonly used: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(copies, entry.name);
    const used = await usedAt(path);
    // Another prune removed it first.
    if (used === undefined) continue;
    if (entry.name.startsWith('.')) {
      if (Date.now() - used > abandonedAfter)
        await rm(path, { recursive: true, force: true });
    } else if (path !== current) found.push({ path, used });
  }
  found.sort((left, right) => right.used - left.used);
  for (const { path } of found.slice(keptCopies - 1)) {
    whole.delete(path);
    await rm(path, { recursive: true, force: true });
  }
}

/** When a copy was last used; undefined when it is gone. */
async function usedAt(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch (cause) {
    if (isCode(cause, 'ENOENT')) return undefined;
    throw cause;
  }
}

/** Runs `work` on every item, a few at once. */
async function each<A>(
  items: ReadonlyArray<A>,
  work: (item: A) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++]!);
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isCode(cause: unknown, code: string): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    cause.code === code
  );
}
