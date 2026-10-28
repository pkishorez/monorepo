import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Seconds each workspace's tests took in CI (October 2026). They only balance
// the shards: a workspace missing here still runs, weighted as DEFAULT_SECONDS.
const SECONDS = {
  'apps/code': 48,
  'apps/connect': 45,
  'apps/kabuki-start': 35,
  'toolkits/std-toolkit': 26,
  'toolkits/auth-toolkit': 20,
  'devtools/devtools': 14,
  'packages/kabuki': 14,
  'toolkits/ai-toolkit': 14,
  'platforms/cli-platform': 12,
  'platforms/web-platform': 12,
  'devtools/laymos': 10,
};
const DEFAULT_SECONDS = 5;

// Changes outside every workspace that cannot change a test's result. Any
// other change outside one (the lockfile, a root config, these scripts) tests
// every workspace.
const IGNORED = [/^\.changeset\//, /^[^/]+\.md$/];

const pnpm = (args, cwd) =>
  JSON.parse(execFileSync('pnpm', args, { cwd, encoding: 'utf8' }));

/** Every workspace with a test script, by its path from the root. */
export function workspaces(root) {
  return pnpm(['list', '-r', '--depth', '-1', '--json'], root)
    .filter(({ path }) => path !== root)
    .filter(
      ({ path }) =>
        JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).scripts
          ?.test,
    )
    .map(({ path }) => relative(root, path))
    .sort();
}

/**
 * The workspaces a change since `base` can affect: those it touches and every
 * workspace depending on them. A change outside every workspace affects all.
 */
export function affected(root, names, base) {
  let since;
  try {
    since = execFileSync('git', ['merge-base', base, 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    console.log(`No merge base with '${base}', so testing all.`);
    return names;
  }
  const changed = execFileSync('git', ['diff', '--name-only', since, 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const outside = changed.filter(
    (file) =>
      !names.some((name) => file.startsWith(`${name}/`)) &&
      !IGNORED.some((pattern) => pattern.test(file)),
  );
  if (outside.length > 0) {
    console.log(`Changed outside a workspace, so testing all:`);
    for (const file of outside) console.log(`  ${file}`);
    return names;
  }
  const reached = new Set(
    pnpm(
      ['list', '-r', '--depth', '-1', '--json', '--filter', `...[${since}]`],
      root,
    ).map(({ path }) => relative(root, path)),
  );
  return names.filter((name) => reached.has(name));
}

/**
 * Splits `names` into `count` shards of near-equal time: the slowest
 * workspace goes first, each to the shard with the least time so far.
 */
export function shard(names, count) {
  const shards = Array.from({ length: count }, () => ({
    seconds: 0,
    names: [],
  }));
  const seconds = (name) => SECONDS[name] ?? DEFAULT_SECONDS;
  const slowest = [...names].sort(
    (a, b) => seconds(b) - seconds(a) || a.localeCompare(b),
  );
  for (const name of slowest) {
    const least = shards.reduce((a, b) => (b.seconds < a.seconds ? b : a));
    least.seconds += seconds(name);
    least.names.push(name);
  }
  return shards.map(({ names }) => names.sort());
}

/**
 * The workspaces one CI job tests. TEST_SHARD is `index/count`, from 1;
 * TEST_BASE, when set, narrows them to those a change since it affects.
 */
export function plan(root, env = process.env) {
  let names = workspaces(root);
  if (env.TEST_BASE) names = affected(root, names, env.TEST_BASE);
  if (!env.TEST_SHARD) return names;
  const [index, count] = env.TEST_SHARD.split('/').map(Number);
  if (!(index >= 1 && index <= count))
    throw new Error(`TEST_SHARD '${env.TEST_SHARD}' is not index/count.`);
  return shard(names, count)[index - 1];
}
