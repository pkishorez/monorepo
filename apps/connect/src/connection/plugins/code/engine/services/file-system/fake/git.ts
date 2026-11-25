import { basename, join } from './paths.js';
import { ensureFolders, put, remove, textFile, type Tree } from './tree.js';

/*
 * Git's state in the fake tree, laid out as git keeps it on a disk, so the
 * fake Git reads it through the File System key as the real git reads its
 * files. A repository `<repo>`:
 *
 *   <repo>/.git/HEAD                       `ref: refs/heads/<branch>\n`
 *   <repo>/.git/config                     `[remote "origin"]` with its `url`
 *                                          and `fetch`, and a `[branch "<b>"]`
 *                                          with `remote = origin` and
 *                                          `merge = refs/heads/<b>` for each
 *                                          local branch that tracks one
 *   <repo>/.git/refs/heads/<branch>        `<sha>\n`; a `/` in a name is a folder
 *   <repo>/.git/refs/remotes/origin/<b>    `<sha>\n`: Origin's branches as the
 *                                          last fetch or push saw them
 *   <repo>/.git/refs/remotes/origin/HEAD   `ref: refs/remotes/origin/main\n`
 *   <repo>/.git/objects/                   empty: the fake keeps no commits
 *
 * Origin is a bare repository on the same computer, outside home, at
 * `originOf(repo)` (`/srv/origin<repo>.git`): its own `HEAD` and
 * `refs/heads/<b>`. A branch there is seen once a fetch copies its
 * `refs/heads` into the repository's `refs/remotes/origin`. A linked
 * Worktree, which only Code makes, is as git makes one:
 * `<repo>/.git/worktrees/<id>/` with `HEAD`, `gitdir` (`<at>/.git\n`) and
 * `commondir` (`../..\n`), and a file `<at>/.git` reading
 * `gitdir: <repo>/.git/worktrees/<id>\n`.
 */

/** Where the Origin of the repository at `repo` is. */
export const originOf = (repo: string) => `/srv/origin${repo}.git`;

/** A made-up commit id, the same for the same seed. */
export const shaOf = (seed: string) => {
  let out = '';
  for (let round = 0; out.length < 40; round++) {
    let hash = 0x811c9dc5 ^ round;
    for (const char of `${round}:${seed}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
    out += (hash >>> 0).toString(16).padStart(8, '0');
  }
  return out.slice(0, 40);
};

/** The branch a `HEAD` file names; null for a detached one. */
export const branchOfHead = (head: string) => {
  const ref = head.trim();
  return ref.startsWith('ref: refs/heads/') ? ref.slice(16) : null;
};

/** A repository's `.git/config`: its Origin, and the branches that track one. */
export interface GitConfig {
  readonly origin: string | null;
  /** Each local branch that tracks an Origin branch, to it: `main` → `origin/main`. */
  readonly upstreams: Readonly<Record<string, string>>;
}

export const configText = ({ origin, upstreams }: GitConfig) =>
  [
    '[core]',
    '\trepositoryformatversion = 0',
    '\tbare = false',
    ...(origin === null
      ? []
      : [
          '[remote "origin"]',
          `\turl = ${origin}`,
          '\tfetch = +refs/heads/*:refs/remotes/origin/*',
        ]),
    ...Object.entries(upstreams).flatMap(([branch, upstream]) => [
      `[branch "${branch}"]`,
      '\tremote = origin',
      `\tmerge = refs/heads/${upstream.replace(/^origin\//, '')}`,
    ]),
    '',
  ].join('\n');

/** The parts of `.git/config` the fake writes, read back. */
export const parseConfig = (text: string): GitConfig => {
  let origin: string | null = null;
  const upstreams: Record<string, string> = {};
  let section: { kind: string; name: string } | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const header = /^\[(\S+)(?: "(.*)")?\]$/.exec(line);
    if (header) {
      section = { kind: header[1] ?? '', name: header[2] ?? '' };
      continue;
    }
    const [key = '', ...rest] = line.split('=');
    const value = rest.join('=').trim();
    if (section?.kind === 'remote' && section.name === 'origin')
      if (key.trim() === 'url') origin = value;
    if (section?.kind === 'branch' && key.trim() === 'merge')
      upstreams[section.name] = `origin/${value.replace(/^refs\/heads\//, '')}`;
  }
  return { origin, upstreams };
};

const writeRef = (tree: Tree, file: string, sha: string) =>
  put(tree, file, textFile(`${sha}\n`));

/** The branches a sample project has: local, what each tracks, and Origin's. */
const SAMPLE = {
  local: ['main', 'feature/sign-in', 'fix/typo'],
  upstreams: {
    main: 'origin/main',
    'feature/sign-in': 'origin/feature/sign-in',
  },
  origin: ['main', 'feature/sign-in', 'release/1.0'],
} as const;

/**
 * `tree` with a sample project at `repo`: a few files, and a repository on
 * `main` with the branches of `SAMPLE`, its Origin fetched. What was at
 * `repo` goes.
 */
export const sampleProject = (tree: Tree, repo: string): Tree => {
  const name = basename(repo) || 'sample';
  const gitDir = join(repo, '.git');
  const origin = originOf(repo);
  const shaFor = (branch: string) => shaOf(`${repo}:${branch}`);
  let next = ensureFolders(remove(tree, repo), repo);
  const files: Record<string, string> = {
    'README.md': `# ${name}\n\nA sample project.\n`,
    'package.json': `${JSON.stringify({ name, version: '0.1.0', type: 'module' }, null, 2)}\n`,
    '.gitignore': 'node_modules\n',
    'src/index.ts': `export const hello = () => 'Hello from ${name}';\n`,
    '.git/HEAD': 'ref: refs/heads/main\n',
    '.git/config': configText({ origin, upstreams: SAMPLE.upstreams }),
    '.git/refs/remotes/origin/HEAD': 'ref: refs/remotes/origin/main\n',
  };
  for (const [path, text] of Object.entries(files))
    next = put(next, join(repo, path), textFile(text));
  next = ensureFolders(next, join(gitDir, 'objects'));
  for (const branch of SAMPLE.local)
    next = writeRef(next, join(gitDir, 'refs/heads', branch), shaFor(branch));
  next = put(next, join(origin, 'HEAD'), textFile('ref: refs/heads/main\n'));
  next = ensureFolders(next, join(origin, 'objects'));
  for (const branch of SAMPLE.origin) {
    next = writeRef(next, join(origin, 'refs/heads', branch), shaFor(branch));
    next = writeRef(
      next,
      join(gitDir, 'refs/remotes/origin', branch),
      shaFor(branch),
    );
  }
  return next;
};
