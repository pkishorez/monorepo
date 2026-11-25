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

export const copiesFolder = join(tmpdir(), 'kestack-devtools', 'monoverse');

const keptCopies = 6;

const abandonedAfter = 60 * 60 * 1000;

const concurrency = 32;

const batch = 500;

const marker = '.kestack-devtools-copy.json';

const writing = new Map<string, Promise<string>>();

const whole = new Set<string>();

export interface CopiedFile {
  readonly path: string;
  readonly link: boolean;
}

export interface CommitCopy {
  readonly copies: string;
  readonly commit: string;
  readonly checkout: string;
  readonly list: () => Promise<ReadonlyArray<CopiedFile>>;
  readonly readMany: (
    paths: ReadonlyArray<string>,
  ) => Promise<ReadonlyMap<string, Uint8Array>>;
}

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
    if (!(await isWhole(folder, copy.commit, files))) throw cause;
  }
  await prune(copy.copies, folder);
  return folder;
}

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
    if (await exists(link)) await rm(link, { force: true });
    try {
      await symlink(installed, link, 'dir');
    } catch (cause) {
      if (!isCode(cause, 'EEXIST')) throw cause;
    }
  }
}

async function prune(copies: string, current: string): Promise<void> {
  const entries = await readdir(copies, { withFileTypes: true });
  const found: Array<{ readonly path: string; readonly used: number }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(copies, entry.name);
    const used = await usedAt(path);
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

async function usedAt(path: string): Promise<number | undefined> {
  try {
    return (await stat(path)).mtimeMs;
  } catch (cause) {
    if (isCode(cause, 'ENOENT')) return undefined;
    throw cause;
  }
}

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
