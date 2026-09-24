// Draws Snapshots from this checkout's source, for trying out `devtools
// snapshot` while working on it.
//
//   pnpm snapshot:dev [project-folder...] [--flag=value...]
//
// Builds the Snapshot page, then draws each project folder (default: this
// package) into .snapshots/<folder-name>.png. Flags go to `devtools snapshot`
// as given, written `--flag=value`; `--base` defaults to main.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('-'));
const projects = args.filter((arg) => !arg.startsWith('-'));
if (!flags.some((flag) => flag.startsWith('--base'))) flags.push('--base=main');
if (projects.length === 0) projects.push('.');
const outDir = path.resolve('.snapshots');

run('pnpm', ['exec', 'vp', 'build']);
mkdirSync(outDir, { recursive: true });

for (const project of projects) {
  const name = path.basename(path.resolve(project));
  run('pnpm', [
    'exec',
    'tsx',
    'src/server/main.ts',
    'snapshot',
    '--ui-root',
    'dist/ui',
    '--project',
    project,
    '--out',
    path.join(outDir, `${name}.png`),
    ...flags,
  ]);
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
