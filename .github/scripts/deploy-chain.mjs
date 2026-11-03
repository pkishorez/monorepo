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
 * - `affected <base> <front end>...`: whether Cloud Connect and each front
 *   end changed since `base`, by pnpm's graph of the workspace.
 * - `release`: whether `@kestack/connect` has pending changesets, so prod
 *   waits for the release PR.
 * - `summary`: the job summary, one row per app.
 *
 * Each writes what the workflow reads to $GITHUB_OUTPUT, or the summary to
 * $GITHUB_STEP_SUMMARY, and prints it too.
 */

/** The package the chain deploys first, and its folder. */
export const CONNECT = { name: '@kestack/connect', dir: 'apps/connect' };

/** The workflow this script serves. */
const WORKFLOW = '.github/workflows/deploy-connect.yml';

// Changes outside every workspace that can change what every app deploys:
// the root manifest, the lockfile, the catalog's versions, the workflow and
// this script.
const FORCED = [
  WORKFLOW,
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
export function affected(root, base, dirs) {
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
  const forced = changed.filter((file) => FORCED.includes(file));
  if (forced.length > 0) {
    console.log('Changed outside a workspace, so deploying every app:');
    for (const file of forced) console.log(`  ${file}`);
  }
  const reached = JSON.parse(
    execFileSync(
      'pnpm',
      ['list', '-r', '--depth', '-1', '--json', '--filter', `...[${since}]`],
      { cwd: root, encoding: 'utf8' },
    ),
  ).map(({ path }) => relative(root, path));
  return pick(dirs, changed, reached);
}

/** Whether `plan`, as `changeset status --output` writes it, bumps the package `name`. */
export function pending(plan, name = CONNECT.name) {
  return plan.releases.some(
    (release) => release.name === name && release.type !== 'none',
  );
}

/** The release plan of the changesets in `root`; null when there are none. */
export function releasePlan(root) {
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
 * The job summary. `chain` is what each job of the chain gave: `ready`
 * from the release check, whether Connect is affected, the results of
 * plugins and connect, and each front end's affected and result.
 */
export function summary(chain) {
  const { stage, ready, connect, plugins, frontEnds } = chain;
  const blocked = ready === false ? 'release pending' : undefined;
  const connectStatus = status({
    result: connect.result,
    affected: connect.affected,
    after:
      blocked ??
      (plugins.result === 'failure' ? 'the Plugins check failed' : undefined),
  });
  const connectStopped =
    connect.affected && connect.result !== 'success'
      ? 'Cloud Connect did not deploy'
      : undefined;
  const rows = [
    `| Cloud Connect | ${connectStatus} | ${url(stage, 'connect')} |`,
    ...frontEnds.map(
      (app) =>
        `| ${app.name} | ${status({ ...app, after: blocked ?? connectStopped })} | ${url(stage, app.name)} |`,
    ),
  ];
  return [
    `## Deploy — \`${stage}\``,
    '',
    ...(ready === false ? [BLOCKED, ''] : []),
    '| App | Status | URL |',
    '| --- | --- | --- |',
    ...rows,
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

function main([command, ...args], env = process.env) {
  const root = process.cwd();
  if (command === 'affected') {
    const [base = '', ...frontEnds] = args;
    const dirs = affected(root, base, [
      CONNECT.dir,
      ...frontEnds.map((name) => `apps/${name}`),
    ]);
    const connect = dirs.includes(CONNECT.dir);
    const reached = frontEnds.filter((name) => dirs.includes(`apps/${name}`));
    console.log(`Cloud Connect: ${connect ? 'affected' : 'unchanged'}`);
    for (const name of frontEnds)
      console.log(
        `${name}: ${reached.includes(name) ? 'affected' : 'unchanged'}`,
      );
    output(`connect=${connect}\nfrontends=${JSON.stringify(reached)}`);
  } else if (command === 'release') {
    const plan = releasePlan(root);
    const bumped = plan === null ? [] : plan.releases;
    for (const release of bumped.filter(({ type }) => type !== 'none'))
      console.log(`Pending: ${release.name} ${release.type}`);
    const blocked = plan !== null && pending(plan);
    console.log(
      blocked ? BLOCKED : `Ready: ${CONNECT.name} has no pending changesets.`,
    );
    output(`ready=${!blocked}`);
  } else if (command === 'summary') {
    const frontEnds = env.FRONT_ENDS.split(/\s+/).filter(Boolean);
    const reached =
      env.FRONTENDS_AFFECTED === '' ? [] : JSON.parse(env.FRONTENDS_AFFECTED);
    // Each front end is a job of its own only once the matrix ran.
    const ran = !['', 'skipped'].includes(env.FRONTEND_RESULT ?? '');
    const jobs = ran ? jobsOfRun(env) : new Map();
    const text = summary({
      stage: env.STAGE,
      ready: env.READY === '' ? undefined : env.READY === 'true',
      plugins: { result: env.PLUGINS_RESULT },
      connect: {
        affected:
          env.CONNECT_AFFECTED === ''
            ? undefined
            : env.CONNECT_AFFECTED === 'true',
        result: env.CONNECT_RESULT,
      },
      frontEnds: frontEnds.map((name) => ({
        name,
        affected:
          env.FRONTENDS_AFFECTED === '' ? undefined : reached.includes(name),
        result: jobs.get(`Front end (${name})`),
      })),
    });
    console.log(text);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  } else {
    console.error(
      'Usage: deploy-chain.mjs affected <base> <front end>... | release | summary',
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
