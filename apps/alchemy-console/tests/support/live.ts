import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRunner } from '../../runner.build.ts';
import { connectGitHub } from './connect.ts';
import { type Outbound, startConsole } from './console.ts';

/*
 * The real thing, on this machine: the runner image built from
 * `Dockerfile`, a container per run started by local Docker, calling back
 * into the Console Worker under Miniflare, which speaks to the real GitHub as
 * the dev App `alchemy-console-dev` (installed on `pkishorez`, installation
 * 173147687, with the sandbox repository only), and to the real Cloudflare.
 * Only the question of who the GitHub user is gets a made-up answer: the
 * connection is the real one.
 *
 * Needs Docker running and the dev App's keys in `.env.github-dev` beside
 * the app or at `CONSOLE_GITHUB_ENV`; a Deploy needs the sandbox Cloudflare
 * account's keys in `.env.cloudflare-sandbox` or at `CONSOLE_CLOUDFLARE_ENV`.
 */

const appDir = fileURLToPath(new URL('../..', import.meta.url));

export const GITHUB_ENV =
  process.env.CONSOLE_GITHUB_ENV ?? path.join(appDir, '.env.github-dev');
export const CLOUDFLARE_ENV =
  process.env.CONSOLE_CLOUDFLARE_ENV ??
  path.join(appDir, '.env.cloudflare-sandbox');

/** Whether the live runs can run here: asked for, and their keys on disk. */
export const liveReady = (keys: ReadonlyArray<string> = [GITHUB_ENV]) =>
  process.env.CONSOLE_RUNNER_LIVE === '1' &&
  keys.every((file) => existsSync(file));

/** `KEY=value` lines, as a `.env` file holds them. */
export const envFile = (file: string): Record<string, string> =>
  Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter((match) => match !== null)
      .map(([, key, value]) => [key!, value!.replace(/^"(.*)"$/, '$1')]),
  );

const IMAGE = 'alchemy-console-runner:live-test';
export const SANDBOX = 'pkishorez/alchemy-console-sandbox';
/** Kishore, as Local mode signs him in from his email, in a browser too. */
export const kishore = {
  id: `local_${Buffer.from('kishore@demo').toString('base64url')}`,
  email: 'kishore@demo',
  name: 'Kishore',
};

/** The real internet, but for who signs in to GitHub: always `pkishorez`. */
const internet: Outbound = async (request) => {
  const url = new URL(request.url);
  if (url.host === 'github.com' && url.pathname === '/login/oauth/access_token')
    return Response.json({ access_token: 'ghu_live_test' });
  if (request.headers.get('authorization') === 'Bearer ghu_live_test')
    return url.pathname === '/user'
      ? Response.json({ login: 'pkishorez' })
      : Response.json({ message: 'Not Found' }, { status: 404 });
  return fetch(request);
};

/** Builds the runner image, starts Console with local Docker for its runs, and connects the sandbox as Kishore. */
export const startLive = async (
  options: {
    /** Serve the app's own assets too, for a browser. */
    readonly assets?: boolean;
    readonly port?: number;
  } = {},
) => {
  const context = await mkdtemp(path.join(tmpdir(), 'runner-image-'));
  await buildRunner(context);
  execFileSync('docker', [
    'build',
    '--quiet',
    '-t',
    IMAGE,
    '-f',
    path.join(appDir, 'Dockerfile'),
    context,
  ]);
  await rm(context, { recursive: true, force: true });
  const env = envFile(GITHUB_ENV);
  const containers = new Set<string>();
  const console_ = await startConsole({
    invites: kishore.email,
    outbound: internet,
    listenEverywhere: true,
    ...(options.assets ? { assets: true } : {}),
    ...(options.port ? { port: options.port } : {}),
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
  const connectionId = await connectGitHub(
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
  return {
    console: console_,
    connectionId,
    dispose: async () => {
      for (const name of containers)
        execFile('docker', ['rm', '--force', name], () => {});
      await console_.dispose();
    },
  };
};
