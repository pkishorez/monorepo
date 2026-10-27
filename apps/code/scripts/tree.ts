import { readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

/*
 * Fails when `src/` breaks the tree's two rules, so the folders keep
 * telling the app's story top down, deep rather than wide.
 *
 * 1. Three   a folder holds at most three concepts: its child folders,
 *            and its files other than its own. Its own files are
 *            `index`, `actor`, `store`, `view`, `commands`, and the one
 *            named as the folder is, so a folder is one actor, or one
 *            module, and its parts.
 * 2. Tests   a test sits in a `tests/` folder, beside what it tests.
 *
 * `pnpm tree` prints each break and exits with 1 when there is one.
 */

const LIMIT = 3;
const OWN = new Set(['index', 'actor', 'store', 'view', 'commands']);
// What the app is started and styled with, at the top of `src/`.
const ROOT = new Set(['app.tsx', 'env.d.ts', 'styles.css']);

const src = join(import.meta.dirname, '..', 'src');
const breaks: Array<string> = [];

const stem = (file: string) =>
  basename(file, extname(file)).replace(/\.(test|proof)$/, '');

const walk = (dir: string, inTests: boolean) => {
  const entries = readdirSync(dir).filter((name) => !name.startsWith('.'));
  const folders = entries.filter((name) =>
    statSync(join(dir, name)).isDirectory(),
  );
  const files = entries.filter((name) => !folders.includes(name));
  const where = relative(src, dir) || 'src';

  if (!inTests) {
    // 2. Tests
    for (const file of files) {
      if (/\.test\.tsx?$/.test(file)) {
        breaks.push(`${where}/${file}: a test outside a tests/ folder`);
      }
    }
    // 1. Three
    const own = (file: string) =>
      (dir === src && ROOT.has(file)) ||
      OWN.has(stem(file)) ||
      stem(file) === basename(dir);
    const concepts = [
      ...folders.filter((name) => name !== 'tests'),
      ...files.filter((file) => !own(file) && !/\.test\.tsx?$/.test(file)),
    ];
    if (concepts.length > LIMIT) {
      breaks.push(
        `${where}: ${concepts.length} concepts, more than ${LIMIT}: ${concepts.join(', ')}`,
      );
    }
  }

  for (const folder of folders) {
    walk(join(dir, folder), inTests || folder === 'tests');
  }
};

walk(src, false);

if (breaks.length > 0) {
  console.error(breaks.join('\n'));
  console.error(`\n${breaks.length} break(s) of the tree's rules.`);
  process.exit(1);
}
console.log('The tree keeps its rules.');
