import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

/*
 * What the deploy:connect chain decides, so it runs the same here as in CI:
 *
 * - `affected <base> <front end>...`: whether Connect Cloud and each front
 *   end changed since `base`, by pnpm's graph of the workspace.
 * - `release`: whether `@kestack/connect` has pending changesets, so prod
 *   waits for the release PR.
 * - `summary`: the job summary, one row per app.
 *
 * Each writes what the workflow reads to $GITHUB_OUTPUT, or the summary to
 * $GITHUB_STEP_SUMMARY, and prints it too.
 */

/** The package the chain deploys first, and its folder. */
const CONNECT = { name: '@kestack/connect', dir: 'apps/connect' };

// Changes outside every workspace that can change what every app deploys:
// the root manifest, the lockfile, the catalog's versions, the workflow and
// this script.
const FORCED = [
  '.github/workflows/deploy-connect.yml',
  '.github/scripts/deploy-chain.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];

/**
 * Of `dirs`, those to deploy: every one when a file in `changed` is forced,
 * else those in `reached`, the changed workspaces and all their dependents.
 */
export function pick(dirs, changed, reached) {
  if (changed.some((file) => FORCED.includes(file))) return dirs;
  return dirs.filter((dir) => reached.includes(dir));
}

/** Of `dirs`, those a change since `base` can affect; every one when `base` is unknown. */
function affected(root, base, dirs) {
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  if (base === '') {
    console.log('No base to compare with, so deploying every app.');
    return dirs;
  }
  let since;
  try {
    git('cat-file', '-e', `${base}^{commit}`);
    since = git('merge-base', base, 'HEAD');
  } catch {
    console.log(`No known base '${base}', so deploying every app.`);
    return dirs;
  }
  const changed = git('diff', '--name-only', since, 'HEAD')
    .split('\n')
    .filter(Boolean);
  const reached = JSON.parse(
    execFileSync(
      'pnpm',
      ['list', '-r', '--depth', '-1', '--json', '--filter', `...[${since}]`],
      { cwd: root, encoding: 'utf8' },
    ),
  ).map(({ path }) => relative(root, path));
  return pick(dirs, changed, reached);
}

/** Whether `plan`, as `changeset status --output` writes it, bumps `@kestack/connect`. */
export function pending(plan) {
  return plan.releases.some(
    ({ name, type }) => name === CONNECT.name && type !== 'none',
  );
}

/** The release plan of the changesets in `root`; null when there are none. */
function releasePlan(root) {
  // With no changeset, nothing is pending; `changeset status` would fail on
  // a branch that changed a package without one.
  const changesets = readdirSync(join(root, '.changeset')).filter(
    (file) => file.endsWith('.md') && file !== 'README.md',
  );
  if (changesets.length === 0) return null;
  const directory = mkdtempSync(join(tmpdir(), 'deploy-chain-'));
  try {
    const file = join(directory, 'plan.json');
    execFileSync('pnpm', ['exec', 'changeset', 'status', '--output', file], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    return JSON.parse(readFileSync(file, 'utf8'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** What the summary says when a pending release stops the chain. */
export const BLOCKED = `Not deployed: \`${CONNECT.name}\` has pending changesets. Merge the release PR (\`chore: release packages\`) first.`;

/** Where `host` is served on `stage`. */
const url = (stage, host) =>
  stage === 'prod'
    ? `https://${host}.kishore.app`
    : `https://${stage}-${host}.kishore.app`;

/**
 * One app's status. `result` is its job's; `affected` whether it changed;
 * `after` why it did not run when it changed, if the step before it stopped.
 */
function status({ result, affected, after }) {
  switch (result) {
    case 'success':
      return '✅ deployed';
    case 'failure':
      return '❌ failed';
    case 'cancelled':
      return '🚫 cancelled';
  }
  if (affected === false) return '⏭️ unchanged, skipped';
  return after ? `⏭️ not deployed: ${after}` : '⏭️ not eligible';
}

/**
 * The job summary. `ready` is the release check's; `connect` whether Connect is
 * affected and its job's result; `frontEnds` each one's. A pull request's
 * preview deploys its front ends alone, so it has no row for Connect Cloud, and
 * they wait for nothing.
 */
export function summary({ stage, ready, connect, frontEnds }) {
  const preview = stage !== 'prod' && stage !== 'demo';
  const blocked = ready === false ? 'release pending' : undefined;
  // Connect Cloud deploys whenever anything does, changed or not.
  const frontEndChanged = frontEnds.some(({ affected }) => affected);
  const connectStopped =
    !preview &&
    (frontEndChanged || connect.affected) &&
    connect.result !== 'success'
      ? 'Connect Cloud did not deploy'
      : undefined;
  const connectRow = `| Connect Cloud | ${status({
    ...connect,
    affected: frontEndChanged || connect.affected,
    after: blocked,
  })} | ${url(stage, 'connect')} |`;
  return [
    `## Deploy — \`${stage}\``,
    '',
    ...(ready === false ? [BLOCKED, ''] : []),
    '| App | Status | URL |',
    '| --- | --- | --- |',
    ...(preview ? [] : [connectRow]),
    ...frontEnds.map(
      (app) =>
        `| ${app.name} | ${status({ ...app, after: blocked ?? connectStopped })} | ${url(stage, app.name)} |`,
    ),
    '',
  ].join('\n');
}

/** Each job of this run's attempt by name, with its conclusion. */
function jobsOfRun(env) {
  const lines = execFileSync(
    'gh',
    [
      'api',
      `repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}/jobs`,
      '--paginate',
      '--jq',
      '.jobs[] | [.name, (.conclusion // .status)] | @tsv',
    ],
    { encoding: 'utf8' },
  );
  return new Map(
    lines
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('\t')),
  );
}

const output = (lines) =>
  appendFileSync(process.env.GITHUB_OUTPUT ?? '/dev/null', `${lines}\n`);

const commands = {
  affected: (root, [base = '', ...frontEnds]) => {
    const dirs = affected(root, base, [
      CONNECT.dir,
      ...frontEnds.map((name) => `apps/${name}`),
    ]);
    const connect = dirs.includes(CONNECT.dir);
    const reached = frontEnds.filter((name) => dirs.includes(`apps/${name}`));
    console.log(`Connect Cloud: ${connect ? 'affected' : 'unchanged'}`);
    for (const name of frontEnds)
      console.log(
        `${name}: ${reached.includes(name) ? 'affected' : 'unchanged'}`,
      );
    output(`connect=${connect}\nfrontends=${JSON.stringify(reached)}`);
  },
  release: (root) => {
    const plan = releasePlan(root);
    const blocked = plan !== null && pending(plan);
    console.log(
      blocked ? BLOCKED : `Ready: ${CONNECT.name} has no pending changesets.`,
    );
    output(`ready=${!blocked}`);
  },
  summary: () => {
    const env = process.env;
    const reached =
      env.FRONTENDS_AFFECTED === '' ? [] : JSON.parse(env.FRONTENDS_AFFECTED);
    // Each front end is a job of its own only once the matrix ran.
    const ran = !['', 'skipped'].includes(env.FRONTEND_RESULT ?? '');
    const jobs = ran ? jobsOfRun(env) : new Map();
    const text = summary({
      stage: env.STAGE,
      ready: env.READY === '' ? undefined : env.READY === 'true',
      connect: {
        affected:
          env.CONNECT_AFFECTED === ''
            ? undefined
            : env.CONNECT_AFFECTED === 'true',
        result: env.CONNECT_RESULT,
      },
      frontEnds: env.FRONT_ENDS.split(/\s+/)
        .filter(Boolean)
        .map((name) => ({
          name,
          affected:
            env.FRONTENDS_AFFECTED === '' ? undefined : reached.includes(name),
          result: jobs.get(`Front end (${name})`),
        })),
    });
    console.log(text);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  },
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [name, ...args] = process.argv.slice(2);
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (command === undefined) {
    console.error(
      'Usage: deploy-chain.mjs affected <base> <front end>... | release | summary',
    );
    process.exitCode = 1;
  } else {
    command(process.cwd(), args);
  }
}
