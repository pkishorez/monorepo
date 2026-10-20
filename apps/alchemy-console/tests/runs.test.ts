import { Effect, Fiber, type Scope, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeOutbox } from '../src/runner/index.ts';
import { mint, verify } from '../src/server/run-token/index.ts';
import type { RunUpdate } from '../src/shared/contracts/run/index.ts';
import { connectGitHub } from './support/connect.ts';
import {
  type ContainerVariables,
  startConsole,
  TEST_VAULT_KEY,
} from './support/console.ts';
import { APP, fakeGitHub, headOf } from './support/github.ts';
import { runnerAt } from './support/runner.ts';

/*
 * Runs in the Worker as it deploys: an Inspect starts a container given
 * only its run's ID, a run token and Console's URL; the runner, through
 * `/runner` with that token, gets its spec and reports each step once, in
 * order, through dropped sockets; the run's owner, and no one else, watches
 * it live and cancels it; and a runner that goes silent is marked Lost and
 * its container stopped. The runner here is the test, speaking the
 * RunnerApi as the real one does.
 */

const ada = { id: 'local_ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'local_bob', email: 'bob@demo', name: 'Bob' };
const SILENCE_MS = 4000;

const github = fakeGitHub();
const started: Array<ContainerVariables> = [];
const stopped: Array<string> = [];
let console_: Awaited<ReturnType<typeof startConsole>>;
let connectionId: string;

beforeAll(async () => {
  console_ = await startConsole({
    invites: 'ada@demo, bob@demo',
    outbound: github.outbound,
    app: APP,
    silenceMs: SILENCE_MS,
    containers: {
      start: (variables) => void started.push(variables),
      stop: (runId) => void stopped.push(runId),
    },
  });
  connectionId = await connectGitHub(console_, github, ada, {
    id: 101,
    login: 'ada-gh',
    type: 'User',
    repositories: ['ada-gh/app'],
  });
});
afterAll(() => console_?.dispose());

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

/** Starts an Inspect of `ada-gh/app` as Ada; answers its run's ID and its container's variables. */
const inspect = async (
  input: { folder?: string; ref?: string | null } = {},
) => {
  const runId = await run(
    Effect.gen(function* () {
      const client = yield* console_.socket(ada);
      return yield* client['Runs.inspect']({
        connectionId,
        repo: 'ada-gh/app',
        folder: input.folder ?? '.',
        setupCommand: null,
        ref: input.ref ?? null,
      });
    }),
  );
  const variables = await until(() =>
    started.find((each) => each.RUN_ID === runId),
  );
  return { runId, variables };
};

/** The run's runner, over `/runner` with `token`; `drop` cuts its socket as a network would. */
const runner = (token: string) => runnerAt(console_.consoleUrl, token);

/** Everything the owner hears of `runId` until it ends. */
const watched = (runId: string) =>
  run(
    Effect.gen(function* () {
      const client = yield* console_.socket(ada);
      return yield* client['Runs.watch']({ runId }).pipe(
        Stream.runCollect,
        Effect.timeout('20 seconds'),
      );
    }),
  ).then((updates) => Array.from(updates) as Array<RunUpdate>);

const eventsOf = (updates: ReadonlyArray<RunUpdate>) =>
  updates.flatMap((update) => (update._tag === 'Events' ? update.events : []));

const lastRun = (updates: ReadonlyArray<RunUpdate>) =>
  updates.filter((update) => update._tag === 'Run').at(-1)!.run;

const result = {
  stackName: 'App',
  stateStore: 'cloudflare' as const,
  providers: ['cloudflare'],
  alchemyVersion: '2.0.0-beta.80',
};

describe('Runs', () => {
  it('starts an Inspect’s container with only its run’s ID, a run token and Console’s URL', async () => {
    const { runId, variables } = await inspect();
    expect(Object.keys(variables).sort()).toEqual([
      'CONSOLE_URL',
      'RUN_ID',
      'RUN_TOKEN',
    ]);
    expect(variables.CONSOLE_URL).toBe(console_.consoleUrl);
    expect(
      await verify(TEST_VAULT_KEY, variables.RUN_TOKEN!, Date.now()),
    ).toEqual({ userId: ada.id, runId });
  });

  it('hands the runner its spec, keeps every step, and lets the owner watch until it ends', async () => {
    const { runId, variables } = await inspect();
    const watching = watched(runId);
    const refused = await run(
      Effect.gen(function* () {
        const { client } = yield* runner(variables.RUN_TOKEN!);
        const spec = yield* client.spec();
        expect(spec).toEqual({
          runId,
          kind: 'inspect',
          repo: 'ada-gh/app',
          commit: headOf('main'),
          folder: '.',
          setupCommand: null,
          stage: 'inspect',
          entrypoint: 'alchemy.run.ts',
          githubToken: 'ghs_installation_101',
        });
        expect(yield* client.credentials()).toEqual({});
        yield* client.report({
          seq: 1,
          event: { _tag: 'Phase', phase: 'cloning' },
        });
        yield* client.log({ seq: 1, lines: ['Fetching ada-gh/app'] });
        yield* client.report({ seq: 2, event: { _tag: 'Inspected', result } });
        yield* client.finish({
          result: { _tag: 'Succeeded', inspect: result },
        });
        return yield* client
          .report({ seq: 3, event: { _tag: 'Phase', phase: 'setup' } })
          .pipe(Effect.flip);
      }),
    );
    expect(refused).toMatchObject({ _tag: 'RunError', reason: 'finished' });
    const updates = await watching;
    expect(updates[0]).toMatchObject({
      _tag: 'Run',
      run: { runId, status: 'inspecting' },
    });
    expect(
      eventsOf(updates).map(({ seq, event }) => [seq, event._tag]),
    ).toEqual([
      [1, 'Phase'],
      [2, 'Inspected'],
    ]);
    expect(
      updates.flatMap((update) => (update._tag === 'Logs' ? update.logs : [])),
    ).toMatchObject([{ seq: 1, lines: ['Fetching ada-gh/app'] }]);
    expect(lastRun(updates)).toMatchObject({
      status: 'succeeded',
      result: { _tag: 'Succeeded', inspect: result },
    });
    expect(stopped).toContain(runId);
  });

  it('refuses a runner without a valid token, and anything at /runner that isn’t an upgrade', async () => {
    const { runId } = await inspect();
    const upgrade = { upgrade: 'websocket' };
    expect((await console_.fetch('/runner')).status).toBe(426);
    expect((await console_.fetch('/runner', undefined, upgrade)).status).toBe(
      401,
    );
    const forged = await mint(
      Buffer.from(new Uint8Array(32).fill(9)).toString('base64'),
      { userId: ada.id, runId, expiresAt: Date.now() + 60_000 },
    );
    expect(
      (await console_.fetch(`/runner?token=${forged}`, undefined, upgrade))
        .status,
    ).toBe(401);
    const spent = await mint(TEST_VAULT_KEY, {
      userId: ada.id,
      runId,
      expiresAt: Date.now() - 1,
    });
    expect(
      (await console_.fetch(`/runner?token=${spent}`, undefined, upgrade))
        .status,
    ).toBe(401);
  });

  it('never shows or cancels one member’s run for another', async () => {
    const { runId } = await inspect();
    const errors = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(bob);
        const watch = yield* client['Runs.watch']({ runId }).pipe(
          Stream.runCollect,
          Effect.flip,
        );
        const cancel = yield* client['Runs.cancel']({ runId }).pipe(
          Effect.flip,
        );
        const repo = yield* client['Runs.inspect']({
          connectionId,
          repo: 'ada-gh/app',
          folder: '.',
          setupCommand: null,
          ref: null,
        }).pipe(Effect.flip);
        return [watch, cancel, repo];
      }),
    );
    for (const error of errors)
      expect(error).toMatchObject({ reason: 'not-found' });
  });

  it('refuses a folder outside the repository', async () => {
    const error = await run(
      Effect.gen(function* () {
        const client = yield* console_.socket(ada);
        return yield* client['Runs.inspect']({
          connectionId,
          repo: 'ada-gh/app',
          folder: 'apps/../../etc',
          setupCommand: null,
          ref: null,
        }).pipe(Effect.flip);
      }),
    );
    expect(error).toMatchObject({ _tag: 'RunError', reason: 'invalid' });
  });

  it('resends what a dropped socket lost, and keeps each step once, with no gaps', async () => {
    const { runId, variables } = await inspect();
    const watching = watched(runId);
    const gap = await run(
      Effect.gen(function* () {
        const { client, drop, opened } = yield* runner(variables.RUN_TOKEN!);
        const outbox = yield* makeOutbox({
          report: (seq, event) => client.report({ seq, event }),
          log: (seq, lines) => client.log({ seq, lines }),
        });
        for (let i = 1; i <= 30; i++) {
          yield* outbox.event({ _tag: 'Phase', phase: 'setup' });
          outbox.line(`line ${i}`);
          if (i === 10 || i === 20) {
            yield* Effect.sleep('30 millis');
            yield* drop;
          }
        }
        yield* outbox.flush;
        expect(opened()).toBe(3);
        // Sent twice: kept once.
        yield* client.report({
          seq: 7,
          event: { _tag: 'Phase', phase: 'setup' },
        });
        const gap = yield* client
          .report({ seq: 40, event: { _tag: 'Phase', phase: 'setup' } })
          .pipe(Effect.flip);
        yield* client.finish({ result: { _tag: 'Failed', message: 'Done.' } });
        return gap;
      }),
    );
    expect(gap).toMatchObject({ _tag: 'RunError', reason: 'invalid' });
    const updates = await watching;
    expect(eventsOf(updates).map(({ seq }) => seq)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    const lines = updates.flatMap((update) =>
      update._tag === 'Logs' ? update.logs.flatMap((log) => log.lines) : [],
    );
    expect(lines).toEqual(
      Array.from({ length: 30 }, (_, i) => `line ${i + 1}`),
    );
    expect(lastRun(updates)).toMatchObject({ status: 'failed' });
  });

  it('tells the runner when its owner cancels, and ends the run cancelled', async () => {
    const { runId, variables } = await inspect();
    const watching = watched(runId);
    const heard = await run(
      Effect.gen(function* () {
        const { client } = yield* runner(variables.RUN_TOKEN!);
        yield* client.spec();
        const cancel = yield* Effect.forkScoped(
          client.cancel().pipe(Stream.runHead),
        );
        yield* Effect.sleep('200 millis');
        const owner = yield* console_.socket(ada);
        yield* owner['Runs.cancel']({ runId });
        const heard = yield* Fiber.await(cancel).pipe(
          Effect.timeout('5 seconds'),
        );
        yield* client.finish({ result: { _tag: 'Cancelled' } });
        const again = yield* owner['Runs.cancel']({ runId }).pipe(Effect.flip);
        expect(again).toMatchObject({ reason: 'finished' });
        return heard;
      }),
    );
    expect(heard).toMatchObject({
      _tag: 'Success',
      value: { _tag: 'Some', value: 'cancel' },
    });
    expect(lastRun(await watching)).toMatchObject({
      status: 'cancelled',
      cancelRequested: true,
      result: { _tag: 'Cancelled' },
    });
  });

  it('marks a run lost when its runner stops reporting, and stops its container', async () => {
    const { runId } = await inspect();
    const updates = await watched(runId);
    expect(lastRun(updates)).toMatchObject({
      status: 'lost',
      result: {
        _tag: 'Failed',
        message: expect.stringContaining('stopped reporting'),
      },
    });
    expect(stopped).toContain(runId);
  }, 30_000);
});
