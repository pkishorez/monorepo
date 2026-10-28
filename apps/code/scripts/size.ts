import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/*
 * Fails when the browser's first load of code grows past its budget,
 * gzipped: the entry chunk, and the entry with every chunk it imports
 * statically, which is what a user waits for before the first paint. The
 * pages and Views loaded on demand (`View.lazy`) are not in it.
 *
 * `pnpm size` builds the app into a folder of its own, reads it, and
 * deletes it. Raise a budget on purpose, a little above the new size,
 * never to quiet it.
 */

const BUDGET = {
  entry: 190 * 1024,
  firstLoad: 605 * 1024,
};

const app = join(import.meta.dirname, '..');
const out = mkdtempSync(join(tmpdir(), 'code-size-'));
execFileSync(
  'pnpm',
  ['exec', 'vp', 'build', '--outDir', out, '--emptyOutDir'],
  {
    cwd: app,
    stdio: 'inherit',
  },
);

const assets = join(out, 'client', 'assets');
const entry = readdirSync(assets).find(
  (name) => name.startsWith('kabuki-start-') && name.endsWith('.js'),
);
if (!entry) throw new Error(`No entry chunk in ${assets}`);

// The chunks the entry imports, as `from"./x.js"` or `import"./x.js"`, and
// theirs; an `import("./x.js")` loads on demand, so it is left out.
const firstLoad = new Set<string>();
const visit = (name: string) => {
  if (firstLoad.has(name)) return;
  firstLoad.add(name);
  const code = readFileSync(join(assets, name), 'utf8').replace(
    /import\(\s*"\.\/[^"]+"\s*\)/g,
    '',
  );
  for (const [, next] of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g))
    visit(next!);
};
visit(entry);

const gzipped = (name: string) =>
  gzipSync(readFileSync(join(assets, name))).length;
const sizes = {
  entry: gzipped(entry),
  firstLoad: [...firstLoad].reduce((sum, name) => sum + gzipped(name), 0),
};
rmSync(out, { recursive: true, force: true });

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
let over = false;
for (const key of ['entry', 'firstLoad'] as const) {
  const fits = sizes[key] <= BUDGET[key];
  over ||= !fits;
  console.log(
    `${fits ? '✓' : '✗'} ${key}: ${kb(sizes[key])} gzip of ${kb(BUDGET[key])}`,
  );
}
console.log(`  first load: ${firstLoad.size} chunks`);
if (over) {
  console.error('code’s first load is over its budget.');
  process.exit(1);
}
