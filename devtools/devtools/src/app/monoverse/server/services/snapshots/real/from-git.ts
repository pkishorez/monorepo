import { spawn } from 'node:child_process';
import { join } from 'node:path';

import type { GitShape } from '../../git/contract/index.js';
import type { Snapshot } from '../contract/index.js';
import { commitFolder } from './commit-copy.js';

type Entry = { readonly blob: string; readonly link: boolean };

type Tree = ReadonlyMap<string, Entry>;

const gitSymlinkMode = '120000';
const detachedCopy = (view: Uint8Array): Uint8Array => new Uint8Array(view);

const keptTrees = 8;
const trees = new Map<string, Promise<Tree>>();

const keptBytes = 64 * 1024 * 1024;
const blobs = new Map<string, Uint8Array>();
let blobBytes = 0;

export function gitSnapshot(
  git: GitShape,
  options: {
    readonly root: string;
    readonly toplevel: string;
    readonly prefix: string;
    readonly commit: string;
    readonly copies: string;
  },
): Snapshot {
  const { root, toplevel, prefix, commit, copies } = options;
  const tree = () => treeOf(git, toplevel, prefix, commit);
  const list = async (folder: string) => {
    const files = [...(await tree()).keys()];
    return folder === ''
      ? files
      : files.filter((path) => path.startsWith(`${folder}/`));
  };
  const readMany = async (paths: ReadonlyArray<string>) =>
    readFrom(toplevel, await tree(), paths);
  const whole = () => treeOf(git, toplevel, '', commit);
  return {
    root,
    source: { kind: 'git', commit },
    list,
    read: async (path) => (await readMany([path])).get(path),
    readMany,
    onDisk: async () => {
      const folder = await commitFolder({
        copies,
        commit,
        checkout: toplevel,
        list: async () =>
          [...(await whole())].map(([path, { link }]) => ({ path, link })),
        readMany: async (paths) => readFrom(toplevel, await whole(), paths),
      });
      return prefix === '' ? folder : join(folder, prefix);
    },
  };
}

async function readFrom(
  toplevel: string,
  files: Tree,
  paths: ReadonlyArray<string>,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const wanted = new Map<string, string>();
  for (const path of paths) {
    const entry = files.get(path);
    if (entry !== undefined) wanted.set(path, entry.blob);
  }
  const contents = await readBlobs(toplevel, [...new Set(wanted.values())]);
  const found = new Map<string, Uint8Array>();
  for (const [path, blob] of wanted) {
    const bytes = contents.get(blob);
    if (bytes !== undefined) found.set(path, bytes);
  }
  return found;
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
  const entries: Array<readonly [string, Entry]> = [];
  for (const record of git.splitNul(output)) {
    const tab = record.indexOf('\t');
    const [mode, type, object] = record.slice(0, tab).split(' ');
    if (type !== 'blob' || object === undefined) continue;
    entries.push([
      record.slice(tab + 1).slice(strip),
      { blob: object, link: mode === gitSymlinkMode },
    ]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return new Map(entries);
}

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
    found.set(object, detachedCopy(output.subarray(at, at + length)));
    at += length + 1;
  }
  return found;
}
