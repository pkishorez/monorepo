import { Effect, type Scope, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProjectDetail } from '../src/shared/contracts/project/index.ts';
import type {
  InspectResult,
  RunUpdate,
} from '../src/shared/contracts/run/index.ts';
import { fakeCloudflare, SANDBOX } from './support/cloudflare.ts';
import { connectGitHub } from './support/connect.ts';
import {
  collect,
  type ContainerVariables,
  type Outbound,
  startConsole,
} from './support/console.ts';
import { APP, fakeGitHub, headOf, repoIdOf } from './support/github.ts';
import { runnerAt } from './support/runner.ts';

/*
 * Projects in the Worker as it deploys: a folder an Inspect read becomes a
 * project, whose Production deploys at once with the credential picked for
 * its provider, handed to that run's runner alone; every step the runner
 * reports moves the run on, live, in every tab; and a Deploy that succeeds
 * leaves the stage live with its outputs. The runner here is the test.
 */

const ada = { id: 'local_ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'local_bob', email: 'bob@demo', name: 'Bob' };
const REPO = 'ada-gh/app';

const github = fakeGitHub();
const outbound: Outbound = (request) =>
  new URL(request.url).host === 'api.cloudflare.com'
    ? fakeCloudflare(request)
    : github.outbound(request);
const started: Array<ContainerVariables> = [];
let console_: Awaited<ReturnType<typeof startConsole>>;
let connectionId: string;
let credentialId: string;

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

const until = async <A>(find: () => A | undefined, wait = 5000) => {
  const deadline = Date.now() + wait;
  while (Date.now() < deadline) {
    const found = find();
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Waited in vain.');
};

const tokenOf = (runId: string) =>
  until(() => started.find((each) => each.RUN_ID === runId)?.RUN_TOKEN);

const inspected = (providers: ReadonlyArray<string> = ['cloudflare']) =>
  ({
    stackName: 'App',
    stateStore: 'cloudflare',
    providers: [...providers],
    alchemyVersion: '2.0.0-beta.80',
  }) satisfies InspectResult;

/** Inspects `folder` of Ada's repository, the test's runner reading `result`; answers the Inspect's run ID. */
const inspect = async (folder: string, result = inspected()) => {
  const runId = await run(
    Effect.gen(function* () {
      const client = yield* console_.socket(ada);
      return yield* client['Runs.inspect']({
        connectionId,
        repo: REPO,
        folder,
        setupCommand: null,
        ref: null,
      });
    }),
  );
  const token = await tokenOf(runId);
  await run(
    Effect.gen(function* () {
      const { client } = yield* runnerAt(console_.consoleUrl, token);
      yield* client.report({ seq: 1, event: { _tag: 'Inspected', result } });
      yield* client.finish({ result: { _tag: 'Succeeded', inspect: result } });
    }),
  );
  return runId;
};

const newProject = (folder: string, inspectRunId: string) => ({
  connectionId,
  repo: REPO,
  folder,
  setupCommand: null,
  productionBranch: null,
  production: {
    credentials: { cloudflare: credentialId } as Record<string, string>,
  },
  inspectRunId,
});

beforeAll(async () => {
  console_ = await startConsole({
    invites: 'ada@demo, bob@demo',
    outbound,
    app: APP,
    containers: {
      start: (variables) => void started.push(variables),
      stop: () => {},
    },
  });
  connectionId = await connectGitHub(console_, github, ada, {
    id: 101,
    login: 'ada-gh',
    type: 'User',
    repositories: [REPO],
    files: {
      [REPO]: [
        'alchemy.run.ts',
        'package.json',
        'apps/web/alchemy.run.ts',
        'apps/api/alchemy.run.ts',
        'apps/api/src/index.ts',
        'node_modules/alchemy/alchemy.run.ts',
      ],
    },
  });
  credentialId = await run(
    Effect.gen(function* () {
      const client = yield* console_.socket(ada);
      const added = yield* client['Credentials.add']({
        provider: 'cloudflare',
        name: 'Sandbox',
        secret: { accountId: SANDBOX.accountId, apiToken: SANDBOX.apiToken },
      });
      return added.credentialId;
    }),
  );
});
afterAll(() => console_?.dispose());

describe('Projects', () => {
  it('finds every folder holding an alchemy.run.ts, the root first, none under node_modules', async () => {
    const folders = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        return yield* client['Repositories.projectFolders']({
          connectionId,
          repo: REPO,
        });
      }),
    );
    expect(folders).toEqual(['.', 'apps/api', 'apps/web']);
  });

  it('makes a project from its Inspect and deploys Production live, handing the credential to that run alone, and the stage goes live with its outputs', async () => {
    const inspectRunId = await inspect('.');
    await run(
      Effect.gen(function* () {
        const tab = yield* console_.socket(ada);
        const other = yield* console_.socket(ada);
        const { projectId, runId } = yield* tab['Projects.create'](
          newProject('.', inspectRunId),
        );
        // The second tab follows the project as the deploy goes.
        const details = yield* collect(other['Projects.get']({ projectId }));
        const first = (yield* details.next) as ProjectDetail;
        expect(first.project).toMatchObject({
          projectId,
          repo: { id: repoIdOf(REPO), fullName: REPO },
          folder: '.',
          productionBranch: 'main',
          stackName: 'App',
          production: {
            credentials: { cloudflare: credentialId },
            variables: [],
          },
          preview: 'same-as-production',
        });
        expect(first.stages).toMatchObject([
          {
            name: 'prod',
            environment: 'production',
            status: 'deploying',
            lastDeployedCommit: null,
            lastRunId: runId,
          },
        ]);

        const token = yield* Effect.promise(() => tokenOf(runId));
        const { client } = yield* runnerAt(console_.consoleUrl, token);
        expect(yield* client.spec()).toMatchObject({
          runId,
          kind: 'deploy',
          repo: REPO,
          commit: headOf('main'),
          folder: '.',
          stage: 'prod',
        });
        expect(yield* client.credentials()).toEqual({
          CLOUDFLARE_ACCOUNT_ID: SANDBOX.accountId,
          CLOUDFLARE_API_TOKEN: SANDBOX.apiToken,
        });
        const watch = yield* collect(other['Runs.watch']({ runId }));
        expect(yield* watch.next).toMatchObject({
          _tag: 'Run',
          run: { status: 'inspecting' },
        });
        yield* client.report({
          seq: 1,
          event: { _tag: 'Phase', phase: 'planning' },
        });
        yield* client.report({
          seq: 2,
          event: {
            _tag: 'Planned',
            resources: [
              {
                fqn: 'Worker',
                logicalId: 'Worker',
                resourceType: 'Cloudflare.Worker',
                action: 'create',
              },
            ],
          },
        });
        yield* client.report({
          seq: 3,
          event: { _tag: 'Phase', phase: 'applying' },
        });
        for (const [seq, status] of [
          [4, 'creating'],
          [5, 'created'],
        ] as const)
          yield* client.report({
            seq,
            event: {
              _tag: 'ResourceStatus',
              fqn: 'Worker',
              logicalId: 'Worker',
              resourceType: 'Cloudflare.Worker',
              status,
              message: null,
            },
          });
        const outputs = { url: 'https://app-prod.sb.workers.dev' };
        yield* client.finish({
          result: { _tag: 'Deployed', inspect: inspected(), outputs },
        });

        // Each phase moved the run on, as the other tab heard it.
        const heard: Array<RunUpdate> = [];
        while (true) {
          const update = (yield* watch.next) as RunUpdate;
          heard.push(update);
          if (update._tag === 'Run' && update.run.status === 'succeeded') break;
        }
        const statuses = heard.flatMap((update) =>
          update._tag === 'Run' ? [update.run.status] : [],
        );
        expect(statuses).toEqual(
          expect.arrayContaining(['planning', 'applying', 'succeeded']),
        );
        expect(
          heard.flatMap((update) =>
            update._tag === 'Events' ? update.events.map(({ seq }) => seq) : [],
          ),
        ).toEqual([1, 2, 3, 4, 5]);

        // The stage is live, at the commit it deployed, with its outputs.
        let last = first;
        while (last.stages[0]!.status !== 'live')
          last = (yield* details.next) as ProjectDetail;
        expect(last.stages[0]).toMatchObject({
          status: 'live',
          lastDeployedCommit: headOf('main'),
          outputs,
        });
        expect(last.runs[0]).toMatchObject({ runId, status: 'succeeded' });

        const list = yield* collect(tab['Projects.list']());
        expect(yield* list.next).toEqual([
          {
            project: last.project,
            production: last.stages[0],
          },
        ]);
      }),
    );
  });

  it('ends a watch of a run that has ended with the run itself, after its every step', async () => {
    const runId = await inspect('apps/api');
    const updates = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        return Array.from(
          yield* client['Runs.watch']({ runId }).pipe(Stream.runCollect),
        );
      }),
    );
    expect(updates.map(({ _tag }) => _tag)).toEqual(['Events', 'Run']);
    expect(updates.at(-1)).toMatchObject({
      _tag: 'Run',
      run: { status: 'succeeded' },
    });
  });

  it('refuses a project before its folder is inspected, without a credential for each provider, or for a folder that is one already', async () => {
    const api = await inspect('apps/api');
    const aws = await inspect('apps/web', inspected(['cloudflare', 'aws']));
    const errors = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        const create = (input: ReturnType<typeof newProject>) =>
          client['Projects.create'](input).pipe(Effect.flip);
        return [
          // An Inspect of another folder.
          yield* create(newProject('apps/web', api)),
          // A credential for Cloudflare, none for AWS.
          yield* create(newProject('apps/web', aws)),
          // A Cloudflare credential named for AWS.
          yield* create({
            ...newProject('apps/web', aws),
            production: {
              credentials: { cloudflare: credentialId, aws: credentialId },
            },
          }),
          // The root is the first test's project.
          yield* create(
            newProject('.', yield* Effect.promise(() => inspect('.'))),
          ),
        ];
      }),
    );
    expect(errors).toMatchObject([
      {
        _tag: 'ProjectError',
        reason: 'not-found',
        message: 'Inspect this folder before making a project of it.',
      },
      {
        _tag: 'ProjectError',
        reason: 'invalid',
        message: 'Pick an AWS credential for Production.',
      },
      {
        _tag: 'ProjectError',
        reason: 'invalid',
        message: 'Pick an AWS credential for Production.',
      },
      {
        _tag: 'ProjectError',
        reason: 'invalid',
        message: 'ada-gh/app is already the project App.',
      },
    ]);
  });

  it('leaves the stage failed when its deploy fails', async () => {
    const inspectRunId = await inspect('apps/web');
    const detail = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        const { projectId, runId } = yield* client['Projects.create'](
          newProject('apps/web', inspectRunId),
        );
        const token = yield* Effect.promise(() => tokenOf(runId));
        const runner = yield* runnerAt(console_.consoleUrl, token);
        yield* runner.client.finish({
          result: { _tag: 'Failed', message: 'The deploy failed: no.' },
        });
        const details = yield* collect(client['Projects.get']({ projectId }));
        let last = (yield* details.next) as ProjectDetail;
        while (last.stages[0]!.status === 'deploying')
          last = (yield* details.next) as ProjectDetail;
        return last;
      }),
    );
    expect(detail.stages[0]).toMatchObject({
      status: 'deploy-failed',
      lastDeployedCommit: null,
      outputs: {},
    });
  });

  it('keeps a credential a project deploys with from being removed', async () => {
    const error = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        return yield* client['Credentials.remove']({ credentialId }).pipe(
          Effect.flip,
        );
      }),
    );
    expect(error).toMatchObject({ _tag: 'CredentialError', reason: 'in-use' });
  });

  it('never shows one member’s project to another', async () => {
    const projectId = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        const list = yield* collect(client['Projects.list']());
        return (
          (yield* list.next) as ReadonlyArray<{
            readonly project: { readonly projectId: string };
          }>
        )[0]!.project.projectId;
      }),
    );
    const [list, error] = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(bob);
        const projects = yield* collect(client['Projects.list']());
        return [
          yield* projects.next,
          yield* client['Projects.get']({ projectId }).pipe(
            Stream.runHead,
            Effect.flip,
          ),
        ] as const;
      }),
    );
    expect(list).toEqual([]);
    expect(error).toMatchObject({ _tag: 'ProjectError', reason: 'not-found' });
    // Nor draws it: its page is not found for him.
    const page = await console_.fetch(`/projects/${projectId}`, bob);
    expect(page.status).toBe(404);
    const own = await console_.fetch(`/projects/${projectId}`, ada);
    expect(own.status).toBe(200);
  });
});
