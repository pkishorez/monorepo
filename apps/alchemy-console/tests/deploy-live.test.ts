import { Effect, Stream } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resourcesOf } from '../src/client/run-view/resources.ts';
import {
  type ProjectDetail,
  urlOf,
} from '../src/shared/contracts/project/index.ts';
import {
  isFinished,
  type RunEvent,
  type RunUpdate,
} from '../src/shared/contracts/run/index.ts';
import {
  CLOUDFLARE_ENV,
  envFile,
  GITHUB_ENV,
  kishore,
  liveReady,
  SANDBOX,
  startLive,
} from './support/live.ts';

/*
 * New project → Production, live: the sandbox repository becomes a project,
 * its Production deploys through the runner in a local Docker container
 * into the sandbox Cloudflare account, as stack `ConsoleSandbox`, stage
 * `prod`, and a second tab watching the project hears every step too. The
 * Worker it deploys answers `hello from prod`.
 *
 * Runs only with `CONSOLE_RUNNER_LIVE=1`, Docker running, the dev App's keys
 * (`.env.github-dev`) and the sandbox account's (`.env.cloudflare-sandbox`)
 * on disk. It deploys `ConsoleSandbox`'s `prod` and leaves it deployed.
 */

let live: Awaited<ReturnType<typeof startLive>>;

const eventsOf = (updates: ReadonlyArray<RunUpdate>) =>
  updates.flatMap((update): ReadonlyArray<RunEvent> =>
    update._tag === 'Events' ? update.events : [],
  );
const lastRun = (updates: ReadonlyArray<RunUpdate>) =>
  updates.filter((update) => update._tag === 'Run').at(-1)!.run;

describe.skipIf(!liveReady([GITHUB_ENV, CLOUDFLARE_ENV]))(
  'New project → Production, live',
  () => {
    beforeAll(async () => {
      live = await startLive();
    }, 600_000);

    afterAll(() => live?.dispose());

    it('deploys the sandbox’s prod, every planned resource created live, in two tabs, and its URL says hello from prod', async () => {
      const keys = envFile(CLOUDFLARE_ENV);
      const outcome = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const tab = yield* live.console.socket(kishore);
            const other = yield* live.console.socket(kishore);
            const { credentialId } = yield* tab['Credentials.add']({
              provider: 'cloudflare',
              name: 'Sandbox',
              secret: {
                accountId: keys.CLOUDFLARE_ACCOUNT_ID!,
                apiToken: keys.CLOUDFLARE_API_TOKEN!,
              },
            });
            const folders = yield* tab['Repositories.projectFolders']({
              connectionId: live.connectionId,
              repo: SANDBOX,
            });
            expect(folders[0]).toBe('.');
            const inspectRunId = yield* tab['Runs.inspect']({
              connectionId: live.connectionId,
              repo: SANDBOX,
              folder: '.',
              setupCommand: null,
              ref: null,
            });
            const inspected = lastRun(
              Array.from(
                yield* tab['Runs.watch']({ runId: inspectRunId }).pipe(
                  Stream.runCollect,
                  Effect.timeout('8 minutes'),
                ),
              ),
            );
            expect(inspected.result).toMatchObject({
              _tag: 'Succeeded',
              inspect: {
                stackName: 'ConsoleSandbox',
                stateStore: 'cloudflare',
                providers: ['cloudflare'],
              },
            });
            const { projectId, runId } = yield* tab['Projects.create']({
              connectionId: live.connectionId,
              repo: SANDBOX,
              folder: '.',
              setupCommand: null,
              productionBranch: null,
              production: { credentials: { cloudflare: credentialId } },
              inspectRunId,
            });
            // The second tab follows the project, and the run, as it goes.
            const seen: Array<ProjectDetail> = [];
            yield* Effect.forkScoped(
              other['Projects.get']({ projectId }).pipe(
                Stream.runForEach((detail) =>
                  Effect.sync(() => void seen.push(detail)),
                ),
              ),
            );
            const [mine, theirs] = yield* Effect.all(
              [tab, other].map((client) =>
                client['Runs.watch']({ runId }).pipe(
                  Stream.runCollect,
                  Effect.map((updates) => Array.from(updates)),
                  Effect.timeout('15 minutes'),
                ),
              ),
              { concurrency: 2 },
            );
            // The stage settles just after the run ends.
            yield* Effect.sleep('1 second');
            return { mine: mine!, theirs: theirs!, seen };
          }),
        ),
      );
      const run = lastRun(outcome.mine);
      expect(run.status, JSON.stringify(run.result)).toBe('succeeded');
      const events = eventsOf(outcome.mine);
      expect(eventsOf(outcome.theirs)).toEqual(events);
      // Every resource the plan changes moved on live, to done.
      const rows = resourcesOf(events)!;
      expect(rows.map((row) => row.logicalId)).toEqual(
        expect.arrayContaining(['Markers', 'Marker', 'Worker']),
      );
      for (const row of rows)
        expect([row.logicalId, row.progress]).toEqual([
          row.logicalId,
          row.action === 'noop' ? 'unchanged' : 'done',
        ]);
      // The second tab saw the stage deploying, then live with its URL.
      const statuses = outcome.seen.map(
        (detail) =>
          detail.stages.find((stage) => stage.name === 'prod')?.status,
      );
      expect(statuses).toContain('deploying');
      const final = outcome.seen.at(-1)!;
      const prod = final.stages.find((stage) => stage.name === 'prod')!;
      expect(prod.status).toBe('live');
      expect(prod.lastDeployedCommit).toBe(run.commit);
      expect(isFinished(final.runs[0]!.status)).toBe(true);
      const url = urlOf(prod.outputs);
      expect(url).toMatch(/^https:\/\//);
      // A new Worker can take a moment to answer on its URL.
      let said = '';
      for (let tries = 0; tries < 30 && said !== 'hello from prod'; tries++) {
        said = await fetch(url!)
          .then((response) => response.text())
          .catch(() => '');
        if (said !== 'hello from prod')
          await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      expect(said).toBe('hello from prod');
    }, 1_200_000);
  },
);
