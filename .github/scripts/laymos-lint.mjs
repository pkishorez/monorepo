// Lints every Laymos Project in the monorepo: each folder holding a
// laymos.config.json, whatever its package's own lint script says. With
// --staged, only the Projects a staged file sits in; a staged change to
// Laymos itself can move any verdict, so then every Project.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname } from 'node:path';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);

const projects = git('ls-files', '*laymos.config.json')
  .filter((config) => !config.includes('/tests/fixtures/'))
  .map(dirname);

let chosen = projects;
if (process.argv.includes('--staged')) {
  const staged = git('diff', '--cached', '--name-only');
  if (!staged.some((path) => path.startsWith('devtools/laymos/src/')))
    chosen = projects.filter((project) =>
      staged.some((path) => path.startsWith(`${project}/`)),
    );
}

const failed = [];
for (const project of chosen) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'laymos', 'lint', '--config', `${project}/laymos.config.json`],
    { encoding: 'utf8' },
  );
  if (result.status === 0) {
    console.log(`✓ ${project}`);
    continue;
  }
  failed.push(project);
  console.log(`✕ ${project}`);
  process.stdout.write(result.stdout + result.stderr);
}

if (failed.length > 0) {
  console.log(`\nlaymos lint failed in ${failed.join(', ')}`);
  process.exit(1);
}
