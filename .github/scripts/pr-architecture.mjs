// Draws the changed architecture of every Laymos Project a pull request
// touches and writes the pull request body section that shows the pictures.
//
//   node .github/scripts/pr-architecture.mjs render
//     Reads BASE_REF, renders one PNG per changed Project into OUT_DIR
//     (default .snapshots) with DEVTOOLS_BIN, and writes OUT_DIR/section.md
//     plus OUT_DIR/attachments.txt (one PNG path per line).
//
//   node .github/scripts/pr-architecture.mjs body <current-body-file> <section-file>
//     Prints the body with the section replaced, or appended when absent.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export const startMarker = '<!-- laymos-architecture:start -->';
export const endMarker = '<!-- laymos-architecture:end -->';

/**
 * The Projects owning at least one changed file: for each file, the deepest
 * Project folder containing it. Folders under a `fixtures` path are test data
 * and never Projects.
 */
export function changedProjects(changedFiles, configPaths) {
  const projects = configPaths
    .map((path) => posix.dirname(path))
    .filter((dir) => !dir.split('/').includes('fixtures'))
    .sort((a, b) => b.length - a.length);
  const touched = new Set();
  for (const file of changedFiles) {
    const owner = projects.find(
      (dir) => dir === '.' || file === dir || file.startsWith(`${dir}/`),
    );
    if (owner !== undefined) touched.add(owner);
  }
  return [...touched].sort();
}

/** A file name for one Project's picture. */
export function snapshotName(project) {
  return `${project.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root'}.png`;
}

/** The pull request body section, with its markers. */
export function renderSection(results) {
  const lines = [startMarker, '## Architecture changes', ''];
  if (results.length === 0) {
    lines.push('No Laymos Project changed.');
  }
  for (const result of results) {
    lines.push(`### \`${result.project}\``, '');
    if (result.error !== undefined) {
      lines.push(`Could not draw this Project: ${result.error}`, '');
      continue;
    }
    if (result.drawn === 'none') {
      lines.push(
        `Files changed, but none of its ${result.modules} modules did since \`${result.baseRef}\`.`,
        '',
      );
      continue;
    }
    const what =
      result.drawn === 'changed'
        ? `${result.changedModules} of ${result.modules} modules changed`
        : `all ${result.modules} modules drawn`;
    lines.push(
      `${what} since \`${result.baseRef}\`.`,
      '',
      `![${result.project} architecture](${result.out})`,
      '',
    );
  }
  lines.push(
    '<sub>Drawn by `devtools snapshot` from `laymos.config.json`; changed modules are outlined, new ones in green.</sub>',
    endMarker,
  );
  return lines.join('\n');
}

/** Replaces the marked section in `body`, or appends it. */
export function replaceSection(body, section) {
  const start = body.indexOf(startMarker);
  const end = body.indexOf(endMarker);
  if (start !== -1 && end !== -1 && end > start) {
    return body.slice(0, start) + section + body.slice(end + endMarker.length);
  }
  const trimmed = body.replace(/\s+$/, '');
  return trimmed === '' ? section : `${trimmed}\n\n${section}`;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line !== '');
}

function render() {
  const baseRef = process.env.BASE_REF;
  if (!baseRef) throw new Error('BASE_REF is required, such as main.');
  const outDir = process.env.OUT_DIR ?? '.snapshots';
  const devtoolsBin =
    process.env.DEVTOOLS_BIN ?? 'devtools/devtools/dist/server/main.mjs';
  const base = `origin/${baseRef}`;
  const changedFiles = git(['diff', '--name-only', `${base}...HEAD`]);
  const configPaths = git([
    'ls-files',
    'laymos.config.json',
    '**/laymos.config.json',
  ]);
  const projects = changedProjects(changedFiles, configPaths);
  mkdirSync(outDir, { recursive: true });

  const results = projects.map((project) => {
    const out = posix.join(outDir, snapshotName(project));
    const run = spawnSync(
      process.execPath,
      [
        devtoolsBin,
        'snapshot',
        '--only-changed',
        '--project',
        project,
        '--base',
        base,
        '--out',
        out,
        '--title',
        project,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (run.status !== 0) {
      const error =
        (run.stderr || run.stdout || '').trim().split('\n').pop() ??
        'unknown error';
      console.error(`::warning::snapshot of ${project} failed: ${error}`);
      return { project, error };
    }
    const summary = JSON.parse(run.stdout);
    if (summary.drawn === 'none') {
      console.log(`${project}: no module changed, nothing drawn`);
      return { project, ...summary, baseRef };
    }
    console.log(
      `${project}: ${summary.changedModules}/${summary.modules} modules changed, ${summary.width}x${summary.height} css px`,
    );
    return { project, out, ...summary, baseRef };
  });

  writeFileSync(join(outDir, 'section.md'), `${renderSection(results)}\n`);
  writeFileSync(
    join(outDir, 'attachments.txt'),
    results
      .filter((result) => result.out !== undefined)
      .map((result) => result.out)
      .join('\n'),
  );
  console.log(JSON.stringify({ projects, outDir }, null, 2));
}

function body(bodyFile, sectionFile) {
  const current = readFileSync(bodyFile, 'utf8');
  const section = readFileSync(sectionFile, 'utf8').trimEnd();
  process.stdout.write(`${replaceSection(current, section)}\n`);
}

// Imported by its test; runs only when invoked directly.
if (process.argv[1]?.endsWith('pr-architecture.mjs')) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'render') render();
  else if (mode === 'body' && rest.length === 2) body(rest[0], rest[1]);
  else {
    console.error(
      'usage: pr-architecture.mjs render | body <body-file> <section-file>',
    );
    process.exitCode = 2;
  }
}
