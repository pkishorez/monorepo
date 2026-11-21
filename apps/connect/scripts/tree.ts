import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';

/*
 * Fails when `src/` breaks the tree's two rules.
 *
 * 1. Linked   parts that use each other are at most three in a folder, four
 *             with a reason in FOUR. A part is a child folder, or a source
 *             file other than the folder's own: `index`, `actor`, `store`,
 *             `view`, `commands`, `main`, and the one named as the folder.
 *             Parts that use no other part are building blocks: a folder
 *             may hold as many as it needs, as it may hold parts none of
 *             which uses another. A folder is never made only to bring the
 *             count down; it is named after a real thing, usually the file
 *             in it that uses the rest.
 * 2. Tests    a test sits in a `tests/` folder, beside what it tests.
 *
 * `pnpm tree` prints each break and exits with 1 when there is one.
 */

const LIMIT = 3;
const OWN = new Set(['index', 'actor', 'store', 'view', 'commands', 'main']);
const SOURCE = /\.tsx?$/;
const TEST = /\.test\.tsx?$/;
// Folders whose linked parts are four, with why.
const FOUR = new Map<string, string>([]);

const src = join(import.meta.dirname, '..', 'src');
const breaks: Array<string> = [];

const stem = (file: string) => basename(file, extname(file));

/** Every source file under `dir` outside a `tests/` folder. */
const sources = (dir: string): Array<string> =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === 'tests' ? [] : sources(path);
    return SOURCE.test(name) && !TEST.test(name) ? [path] : [];
  });

const files = sources(src);
const known = new Set(files);

/** The file a relative import names, if it is one of `files`. */
const resolve = (from: string, spec: string): string | undefined => {
  const base = join(dirname(from), spec);
  const candidates = [
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
    base,
    join(base, 'index.ts'),
  ];
  return candidates.find((each) => known.has(each));
};

const IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const imports = new Map(
  files.map((file) => [
    file,
    [...readFileSync(file, 'utf8').matchAll(IMPORT)].flatMap(([, spec]) => {
      const target = resolve(file, spec!);
      return target === undefined || target === file ? [] : [target];
    }),
  ]),
);

/** The part of `dir` that `file` is in, or null for the folder's own files and anything outside it. */
const partOf = (dir: string, file: string): string | null => {
  const path = relative(dir, file);
  if (path.startsWith('..')) return null;
  const [first, ...rest] = path.split(sep);
  if (rest.length > 0) return `${first}/`;
  const name = stem(first!);
  return OWN.has(name) || name === basename(dir) ? null : name;
};

/** The largest set of parts linked by their uses, leaving out building blocks. */
const linkedOf = (dir: string): Array<string> => {
  const uses = new Map<string, Set<string>>();
  for (const [file, targets] of imports) {
    const from = partOf(dir, file);
    if (from === null) continue;
    for (const target of targets) {
      const to = partOf(dir, target);
      if (to === null || to === from) continue;
      uses.set(from, (uses.get(from) ?? new Set()).add(to));
    }
  }
  const users = new Set(uses.keys());
  const near = new Map<string, Set<string>>();
  for (const [from, tos] of uses)
    for (const to of tos)
      if (users.has(to)) {
        near.set(from, (near.get(from) ?? new Set()).add(to));
        near.set(to, (near.get(to) ?? new Set()).add(from));
      }
  let largest: Array<string> = [];
  const seen = new Set<string>();
  for (const start of users) {
    if (seen.has(start)) continue;
    const group: Array<string> = [];
    const queue = [start];
    while (queue.length > 0) {
      const part = queue.pop()!;
      if (seen.has(part)) continue;
      seen.add(part);
      group.push(part);
      queue.push(...(near.get(part) ?? []));
    }
    if (group.length > largest.length) largest = group;
  }
  return largest.sort();
};

const walk = (dir: string) => {
  const where = relative(src, dir) || 'src';
  const entries = readdirSync(dir).filter((name) => !name.startsWith('.'));
  for (const name of entries) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) {
      // 2. Tests
      if (TEST.test(name))
        breaks.push(`${where}/${name}: a test outside a tests/ folder`);
    } else if (name !== 'tests') walk(path);
  }
  // 1. Linked
  const linked = linkedOf(dir);
  const allowed = FOUR.has(where) ? LIMIT + 1 : LIMIT;
  if (linked.length > allowed)
    breaks.push(
      `${where}: ${linked.length} parts use each other (${linked.join(', ')}); at most ${LIMIT}, or ${LIMIT + 1} named in FOUR with why`,
    );
};

if (!existsSync(src)) throw new Error(`No src/ at ${src}`);
walk(src);

if (breaks.length > 0) {
  process.stderr.write(`${breaks.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('The tree keeps its rules.\n');
