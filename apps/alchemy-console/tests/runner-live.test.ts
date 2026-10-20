import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildRunner } from '../runner.build.ts';
import type { RunUpdate } from '../src/shared/contracts/run/index.ts';
import { connectGitHub } from './support/connect.ts';
import { type Outbound, startConsole } from './support/console.ts';

/*
 * The real thing, on this machine: the runner image built from
 * `Dockerfile`, a container per run started by local Docker, calling back
 * into the Console Worker under Miniflare, which speaks to the real GitHub as
 * the dev App `alchemy-console-dev` (installed on `pkishorez`, installation
 * 173147687, with the sandbox repository only). Only the question of who the
 * GitHub user is gets a made-up answer: the connection is the real one.
 *
 * Runs only with `CONSOLE_RUNNER_LIVE=1`, Docker running, and the dev App's
 * keys in `.env.github-dev` beside the app or at `CONSOLE_GITHUB_ENV`.
 */

const file =
  process.env.CONSOLE_GITHUB_ENV ??
  fileURLToPath(new URL('../.env.github-dev', import.meta.url));
const live = process.env.CONSOLE_RUNNER_LIVE === '1' && existsSync(file);

const envOf = (text: string) =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter((match) => match !== null)
      .map(([, key, value]) => [key!, value!.replace(/^"(.*)"$/, '$1')]),
  );

const IMAGE = 'alchemy-console-runner:live-test';
const SANDBOX = 'pkishorez/alchemy-console-sandbox';
const kishore = { id: 'local_kishore', email: 'kishore@demo', name: 'Kishore' };

/** The real GitHub, but for who signs in to it: always `pkishorez`. */
const github: Outbound = async (request) => {
  const url = new URL(request.url);
  if (url.host === 'github.com' && url.pathname === '/login/oauth/access_token')
    return Response.json({ access_token: 'ghu_live_test' });
  if (request.headers.get('authorization') === 'Bearer ghu_live_test')
    return url.pathname === '/user'
      ? Response.json({ login: 'pkishorez' })
      : Response.json({ message: 'Not Found' }, { status: 404 });
  return fetch(request);
};

let console_: Awaited<ReturnType<typeof startConsole>>;
let connectionId: string;
const containers = new Set<string>();

describe.skipIf(!live)('Runner, live, in a local container', () => {
  beforeAll(async () => {
    const context = await mkdtemp(path.join(tmpdir(), 'runner-image-'));
    await buildRunner(context);
    execFileSync('docker', [
      'build',
      '--quiet',
      '-t',
      IMAGE,
      '-f',
      fileURLToPath(new URL('../Dockerfile', import.meta.url)),
      context,
    ]);
    await rm(context, { recursive: true, force: true });
    const env = envOf(readFileSync(file, 'utf8'));
    console_ = await startConsole({
      invites: kishore.email,
      outbound: github,
      listenEverywhere: true,
      app: {
        id: env.GH_APP_ID!,
        slug: env.GH_APP_SLUG!,
        privateKey: env.GH_APP_PRIVATE_KEY!.replaceAll('\\n', '\n'),
        webhookSecret: env.GH_APP_WEBHOOK_SECRET!,
        clientId: env.GH_APP_CLIENT_ID!,
        clientSecret: env.GH_APP_CLIENT_SECRET!,
      },
      containers: {
        start: ({ RUN_ID, RUN_TOKEN, CONSOLE_URL }) => {
          const name = `console-run-${RUN_ID!.toLowerCase()}`;
          containers.add(name);
          // The token reaches the container through the environment, never
          // a command line.
          execFile(
            'docker',
            [
              'run',
              '--detach',
              '--rm',
              '--name',
              name,
              '--add-host',
              'host.docker.internal:host-gateway',
              '-e',
              'RUN_ID',
              '-e',
              'RUN_TOKEN',
              '-e',
              'CONSOLE_URL',
              IMAGE,
            ],
            {
              env: {
                ...process.env,
                RUN_ID,
                RUN_TOKEN,
                CONSOLE_URL: CONSOLE_URL!.replace(
                  '127.0.0.1',
                  'host.docker.internal',
                ),
              },
            },
          );
        },
        stop: (runId) => {
          execFile('docker', [
            'rm',
            '--force',
            `console-run-${runId.toLowerCase()}`,
          ]);
        },
      },
    });
    connectionId = await connectGitHub(
      console_,
      // The App is installed already; any code signs in as `pkishorez`.
      { install: (installation) => installation, user: () => 'live-code' },
      kishore,
      {
        id: 173147687,
        login: 'pkishorez',
        type: 'User',
        repositories: [SANDBOX],
      },
    );
  }, 600_000);

  afterAll(async () => {
    for (const name of containers)
      execFile('docker', ['rm', '--force', name], () => {});
    await console_?.dispose();
  });

  /** Inspects the sandbox at `ref`; answers everything Kishore hears of the run. */
  const inspectAt = (ref: string) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* console_.socket(kishore);
          const runId = yield* client['Runs.inspect']({
            connectionId,
            repo: SANDBOX,
            folder: '.',
            setupCommand: null,
            ref,
          });
          const updates = yield* client['Runs.watch']({ runId }).pipe(
            Stream.runCollect,
            Effect.timeout('8 minutes'),
          );
          return Array.from(updates) as Array<RunUpdate>;
        }),
      ),
    );

  const lastRun = (updates: ReadonlyArray<RunUpdate>) =>
    updates.filter((update) => update._tag === 'Run').at(-1)!.run;

  it('inspects the sandbox at main: ConsoleSandbox, Cloudflare state and provider, and its Alchemy', async () => {
    const updates = await inspectAt('main');
    const run = lastRun(updates);
    expect(run.status, JSON.stringify(run.result)).toBe('succeeded');
    expect(run.result).toMatchObject({
      _tag: 'Succeeded',
      inspect: {
        stackName: 'ConsoleSandbox',
        stateStore: 'cloudflare',
        providers: expect.arrayContaining(['cloudflare']),
        alchemyVersion: '2.0.0-beta.80',
      },
    });
    const phases = updates.flatMap((update) =>
      update._tag === 'Events'
        ? update.events.map(({ event }) =>
            event._tag === 'Phase' ? event.phase : event._tag,
          )
        : [],
    );
    expect(phases).toEqual(['cloning', 'setup', 'inspecting', 'Inspected']);
  }, 600_000);

  it('fails the sandbox’s local-state fixture, saying to use Cloudflare state', async () => {
    const run = lastRun(await inspectAt('fixture/local-state'));
    expect(run.status).toBe('failed');
    expect(run.result).toEqual({
      _tag: 'Failed',
      message:
        'This project keeps its state in a local file. Use `Cloudflare.state()` to deploy from Console.',
    });
  }, 600_000);
});
