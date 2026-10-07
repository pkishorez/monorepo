// Copies Panel UI components into src/components with Panel UI's own CLI,
// then makes them this package's: `@/…` imports become relative, `cn` and
// the theme hooks come from ../theme, and everything the named components
// pull in lands in src/components/parts (private; not exported).
//
//   pnpm add-panelui button switch [--overwrite]
//
// The CLI runs in a throwaway Expo-shaped folder, since it writes to
// `components/ui`, `lib` and `hooks` and imports through an `@/` alias that a
// published package cannot use. Existing files are kept unless --overwrite.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const components = path.join(root, 'src/components');
const parts = path.join(components, 'parts');
const theme = path.join(root, 'src/theme');
// Owned by ../theme, not copied: `cn` and the theme hook.
const fromTheme = new Set(['cn', 'use-theme']);

const args = process.argv.slice(2);
const overwrite = args.includes('--overwrite');
const names = args.filter((arg) => !arg.startsWith('--'));
if (names.length === 0) {
  console.error('Usage: pnpm add-panelui <component...> [--overwrite]');
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'panelui-'));
// Every package this toolkit already has counts as installed, so the CLI only
// tries to install what a component newly needs (and says so).
const deps = Object.fromEntries(
  [pkg.dependencies, pkg.peerDependencies, pkg.devDependencies]
    .flatMap((group) => Object.keys(group ?? {}))
    .map((name) => [name, '*']),
);
fs.writeFileSync(
  path.join(scratch, 'package.json'),
  JSON.stringify({ name: 'scratch', private: true, dependencies: deps }),
);
fs.writeFileSync(
  path.join(scratch, 'tsconfig.json'),
  JSON.stringify({ extends: 'expo/tsconfig.base' }),
);

const cli = path.join(root, 'node_modules/.bin/panelui-cli');
for (const command of [['init'], ['add', ...names]]) {
  const run = spawnSync(cli, ['--cwd', scratch, ...command, '--yes'], {
    stdio: 'inherit',
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

const copied = ['components/ui', 'lib', 'hooks'].flatMap((dir) => {
  const from = path.join(scratch, dir);
  return fs.existsSync(from)
    ? fs.readdirSync(from).map((file) => path.join(from, file))
    : [];
});
const stem = (file) => path.basename(file).replace(/\.tsx?$/, '');
const isPublic = (name) =>
  names.includes(name) ||
  ['.tsx', '.ts'].some((ext) =>
    fs.existsSync(path.join(components, name + ext)),
  );
const placeOf = new Map(
  copied
    .filter((file) => !fromTheme.has(stem(file)))
    .map((file) => [
      stem(file),
      path.join(isPublic(stem(file)) ? components : parts, path.basename(file)),
    ]),
);

const relative = (fromFile, toFile) => {
  const rel = path.relative(path.dirname(fromFile), toFile);
  return rel.startsWith('.') ? rel : `./${rel}`;
};

for (const [name, dest] of placeOf) {
  if (fs.existsSync(dest) && !overwrite) {
    console.log(`· ${path.relative(root, dest)} (exists, kept)`);
    continue;
  }
  const source = copied.find((file) => stem(file) === name);
  const text = fs
    .readFileSync(source, 'utf8')
    .replace(
      /(['"])@\/(?:components\/ui|lib|hooks)\/([\w-]+)\1/g,
      (_, quote, target) => {
        if (fromTheme.has(target)) return quote + relative(dest, theme) + quote;
        const to = placeOf.get(target);
        if (!to) throw new Error(`${name} imports unknown @/…/${target}`);
        return quote + relative(dest, to.replace(/\.tsx?$/, '')) + quote;
      },
    );
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, text);
  console.log(`+ ${path.relative(root, dest)}`);
  if (text.includes('useThemeMode')) {
    console.warn(
      `! ${path.relative(root, dest)} uses useThemeMode: use useTheme from ../theme`,
    );
  }
}

fs.rmSync(scratch, { recursive: true, force: true });
console.log(
  '\nAdd new exposed components to laymos.config.json and the README.',
);
