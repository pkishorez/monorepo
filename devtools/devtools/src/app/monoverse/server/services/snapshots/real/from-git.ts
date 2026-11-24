import { spawn } from 'node:child_process';

import type { GitShape } from '../../git/contract/index.js';
import type { Snapshot } from '../contract/index.js';

/*
 * A Project read from git at one commit, nothing checked out: the file list
 * from `git ls-tree`, the contents from `git cat-file --batch`, many files
 * in one process. A commit never changes, so its file list and the blobs
 * read are kept, a few commits and a bounded number of bytes.
 */

/** Each file of a commit under the Project folder, by path, and its blob. */
type Tree = ReadonlyMap<string, string>;

const keptTrees = 8;
const trees = new Map<string, Promise<Tree>>();

const keptBytes = 64 * 1024 * 1024;
const blobs = new Map<string, Uint8Array>();
let blobBytes = 0;

/**
 * The Project at `root`, `prefix` inside the repository at `toplevel`, as
 * `commit` has it.
 */
export function gitSnapshot(
  git: GitShape,
  options: {
    readonly root: string;
    readonly toplevel: string;
    readonly prefix: string;
    readonly commit: string;
  },
): Snapshot {
  const { root, toplevel, prefix, commit } = options;
  const tree = () => treeOf(git, toplevel, prefix, commit);
  const readMany = async (paths: ReadonlyArray<string>) => {
    const files = await tree();
    const wanted = new Map<string, string>();
    for (const path of paths) {
      const blob = files.get(path);
      if (blob !== undefined) wanted.set(path, blob);
    }
    const contents = await readBlobs(toplevel, [...new Set(wanted.values())]);
    const found = new Map<string, Uint8Array>();
    for (const [path, blob] of wanted) {
      const bytes = contents.get(blob);
      if (bytes !== undefined) found.set(path, bytes);
    }
    return found;
  };
  return {
    root,
    source: { kind: 'git', commit },
    list: async (folder) => {
      const files = [...(await tree()).keys()];
      return folder === ''
        ? files
        : files.filter((path) => path.startsWith(`${folder}/`));
    },
    read: async (path) => (await readMany([path])).get(path),
    readMany,
  };
}

function treeOf(
  git: GitShape,
  toplevel: string,
  prefix: string,
  commit: string,
) {
  const key = `${toplevel}\0${commit}\0${prefix}`;
  const kept = trees.get(key);
  if (kept !== undefined) {
    // Most recently used last.
    trees.delete(key);
    trees.set(key, kept);
    return kept;
  }
  const loading = listTree(git, toplevel, prefix, commit);
  trees.set(key, loading);
  loading.catch(() => trees.delete(key));
  while (trees.size > keptTrees) trees.delete(trees.keys().next().value!);
  return loading;
}

// `<mode> SP <type> SP <object> TAB <path>`, NUL-terminated; only blobs are
// files (a submodule is a commit).
async function listTree(
  git: GitShape,
  toplevel: string,
  prefix: string,
  commit: string,
): Promise<Tree> {
  const output = await git.require(
    toplevel,
    [
      'ls-tree',
      '-r',
      '-z',
      '--full-tree',
      commit,
      ...(prefix === '' ? [] : ['--', `${prefix}/`]),
    ],
    'command-failed',
  );
  const strip = prefix === '' ? 0 : prefix.length + 1;
  const entries: Array<readonly [string, string]> = [];
  for (const record of git.splitNul(output)) {
    const tab = record.indexOf('\t');
    const [, type, object] = record.slice(0, tab).split(' ');
    if (type !== 'blob' || object === undefined) continue;
    entries.push([record.slice(tab + 1).slice(strip), object]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return new Map(entries);
}

/** The contents of `objects`, kept ones from memory, the rest in one batch. */
async function readBlobs(
  toplevel: string,
  objects: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const found = new Map<string, Uint8Array>();
  const missing: Array<string> = [];
  for (const object of objects) {
    const bytes = blobs.get(object);
    if (bytes === undefined) missing.push(object);
    else found.set(object, bytes);
  }
  if (missing.length === 0) return found;
  for (const [object, bytes] of await catFileBatch(toplevel, missing)) {
    found.set(object, bytes);
    keep(object, bytes);
  }
  return found;
}

function keep(object: string, bytes: Uint8Array) {
  if (bytes.byteLength > keptBytes / 8 || blobs.has(object)) return;
  blobs.set(object, bytes);
  blobBytes += bytes.byteLength;
  while (blobBytes > keptBytes) {
    const [oldest, oldBytes] = blobs.entries().next().value!;
    blobs.delete(oldest);
    blobBytes -= oldBytes.byteLength;
  }
}

/**
 * Runs one `git cat-file --batch` for every object: each answer is
 * `<object> <type> <size>\n<bytes>\n`, or `<object> missing\n`.
 */
export function catFileBatch(
  cwd: string,
  objects: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks: Array<Buffer> = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => (stderr += String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`git cat-file --batch: ${stderr.trim()}`));
        return;
      }
      resolve(parseBatch(Buffer.concat(chunks)));
    });
    child.stdin.on('error', reject);
    child.stdin.end(`${objects.join('\n')}\n`);
  });
}

function parseBatch(output: Buffer): ReadonlyMap<string, Uint8Array> {
  const found = new Map<string, Uint8Array>();
  let at = 0;
  while (at < output.length) {
    const end = output.indexOf(0x0a, at);
    if (end === -1) break;
    const [object = '', type, size] = output
      .subarray(at, end)
      .toString('utf8')
      .split(' ');
    at = end + 1;
    if (type === 'missing' || size === undefined) continue;
    const length = Number(size);
    // A copy, so a kept blob does not hold the whole batch's output.
    found.set(object, new Uint8Array(output.subarray(at, at + length)));
    at += length + 1;
  }
  return found;
}
