import { Effect, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunUpdate } from '../src/shared/contracts/run/index.ts';
import { kishore, liveReady, SANDBOX, startLive } from './support/live.ts';

/*
 * The Inspect, live: the runner image built from `Dockerfile`, a container
 * per run started by local Docker, and the real GitHub (`support/live.ts`).
 *
 * Runs only with `CONSOLE_RUNNER_LIVE=1`, Docker running, and the dev App's
 * keys in `.env.github-dev` beside the app or at `CONSOLE_GITHUB_ENV`.
 */

let live: Awaited<ReturnType<typeof startLive>>;

describe.skipIf(!liveReady())('Runner, live, in a local container', () => {
  beforeAll(async () => {
    live = await startLive();
  }, 600_000);

  afterAll(() => live?.dispose());

  /** Inspects the sandbox at `ref`; answers everything Kishore hears of the run. */
  const inspectAt = (ref: string) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* live.console.socket(kishore);
          const runId = yield* client['Runs.inspect']({
            connectionId: live.connectionId,
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
