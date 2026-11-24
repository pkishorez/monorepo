import { execFileSync } from 'node:child_process';
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import {
  type PackageReport,
  type Violation,
  configFile,
  isSource,
  joinPath,
  openProject,
} from '../index.ts';
import { workspaceOf } from './workspace.ts';

/*
 * `monoverse lint [--staged]`: checks the packages around the folder it
 * runs in. Inside a package, that package; anywhere else in the
 * repository, every workspace package with a monoverse.json. With
 * `--staged`, only those holding a staged file, each checked whole.
 * Exits 1 on any problem.
 */

const usage = `Usage: monoverse lint [--staged]

Checks each package's imports against its monoverse.json.
Inside a package, checks that package; at the repository root, every
package with a monoverse.json. --staged checks only the packages that
hold a staged file.`;

const main = (args: readonly string[]): number => {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage);
    return 0;
  }
  const [command, ...flags] = args;
  const unknown = flags.find((flag) => flag !== '--staged');
  if (command !== 'lint' || unknown !== undefined) {
    console.error(
      command === 'lint'
        ? `monoverse: unknown option ${unknown}\n\n${usage}`
        : `${usage}`,
    );
    return 2;
  }
  const staged = flags.includes('--staged');

  const cwd = realpathSync(process.cwd());
  const git = gitRoot(cwd);
  if (staged && git === undefined) {
    console.error('monoverse: --staged needs a git repository.');
    return 2;
  }
  const root = git ?? cwd;
  // With --staged, the files and their text are the index's, what the
  // commit will hold; without it, the working tree's.
  const files =
    git === undefined
      ? walk(root)
      : staged
        ? lines(run(root, ['ls-files', '--cached', '-z']))
        : lines(
            run(root, ['ls-files', '-co', '--exclude-standard', '-z']),
          ).filter((file) => isFile(join(root, file)));
  let index: ReadonlyMap<string, string> | undefined;
  const project = openProject({
    root,
    files,
    ...(staged ? { read: (file: string) => index?.get(file) } : {}),
  });
  const here = posixPath(relative(root, cwd));
  const inside = project.packageOf(here.startsWith('..') ? '' : here);

  let scope: readonly string[];
  if (inside !== '') {
    if (!project.packages.includes(inside)) {
      console.log(
        `monoverse: ${inside} has no monoverse.json, so nothing is checked.`,
      );
      return 0;
    }
    scope = [inside];
  } else {
    const isWorkspace = workspaceOf(root);
    scope = project.packages.filter((pkg) => pkg === '' || isWorkspace(pkg));
  }
  if (staged) {
    const touched = new Set(
      lines(
        run(root, ['diff', '--cached', '--name-only', '--no-renames', '-z']),
      ).map((file) => project.packageOf(file)),
    );
    scope = scope.filter((pkg) => touched.has(pkg));
  }
  if (scope.length === 0) {
    console.log(
      staged
        ? 'monoverse: no staged file is in a package with a monoverse.json.'
        : 'monoverse: no package here has a monoverse.json.',
    );
    return 0;
  }

  if (staged) {
    const chosen = new Set(scope);
    index = stagedTexts(
      root,
      // Only what the rules read: source files and each monoverse.json.
      files.filter(
        (file) =>
          (isSource(file) || posix.basename(file) === configFile) &&
          chosen.has(project.packageOf(file)),
      ),
    );
  }
  const reports = project.check({ packages: scope });
  const path = (file: string) => posixPath(relative(cwd, join(root, file)));
  let problems = 0;
  let failed = 0;
  for (const report of reports) {
    const told = tell(report, path);
    if (told.length === 0) continue;
    problems += told.length;
    failed += 1;
    console.log(`${report.path === '' ? '.' : report.path}`);
    for (const line of told) console.log(`  ${line}`);
    console.log('');
  }
  const packages = `${reports.length} ${reports.length === 1 ? 'package' : 'packages'}`;
  if (problems === 0) {
    console.log(`monoverse: checked ${packages}, no problems.`);
    return 0;
  }
  console.log(
    `monoverse: ${problems} ${problems === 1 ? 'problem' : 'problems'} in ${failed} of ${packages}.`,
  );
  return 1;
};

/** The lines a package's report prints: `path:line:col  message`. */
const tell = (
  { result }: PackageReport,
  path: (file: string) => string,
): readonly string[] => {
  switch (result._tag) {
    case 'Unchecked':
      return [];
    case 'Invalid':
      return [`${path(result.file)}:1:1  ${result.message}`];
    case 'Checked':
      return result.violations.map(
        (v: Violation) => `${path(v.file)}:${v.line}:${v.column}  ${v.message}`,
      );
  }
};

const run = (cwd: string, args: readonly string[]): string =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

/** The staged text of `files`, read with one `git cat-file --batch`. */
const stagedTexts = (
  root: string,
  files: readonly string[],
): ReadonlyMap<string, string> => {
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: files.map((file) => `:${file}\n`).join(''),
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const texts = new Map<string, string>();
  let at = 0;
  for (const file of files) {
    const end = output.indexOf(10, at);
    if (end === -1) break;
    const header = output.subarray(at, end).toString('utf8');
    at = end + 1;
    // `<object> <type> <size>` then the content, or `<name> missing`.
    const [, type, size] = /^\S+ (\S+) (\d+)$/.exec(header) ?? [];
    if (size === undefined) continue;
    if (type === 'blob')
      texts.set(file, output.subarray(at, at + Number(size)).toString('utf8'));
    at += Number(size) + 1;
  }
  return texts;
};

const gitRoot = (cwd: string): string | undefined => {
  try {
    return realpathSync(run(cwd, ['rev-parse', '--show-toplevel']).trim());
  } catch {
    return undefined;
  }
};

const lines = (output: string): readonly string[] =>
  output.split('\0').filter(Boolean);

const isFile = (path: string): boolean =>
  statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;

const posixPath = (path: string): string =>
  sep === '/' ? path : path.split(sep).join(posix.sep);

/** Every file below `root`, outside git: no node_modules, .git or dist. */
const walk = (root: string, dir = ''): readonly string[] =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = joinPath(dir, entry.name);
    if (entry.isDirectory())
      return ['node_modules', '.git', 'dist'].includes(entry.name)
        ? []
        : walk(root, path);
    return entry.isFile() ? [path] : [];
  });

process.exitCode = main(process.argv.slice(2));
