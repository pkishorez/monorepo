import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Exit, Layer, type Scope } from 'effect';
import { TestClock } from 'effect/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  makeFakeHarness,
  type FakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import { EVERY } from '../actor-code/actor-session/branch.js';
import {
  Engine,
  Store,
  storeLayer,
  type StartSession,
  type StartStepReport,
} from '../index.js';

/*
 * Sessions in a git Project, against a real clone of an Origin of its own:
 * where a start puts each Session and the steps it reports, a git step
 * that fails starting nothing, the first Title naming a new Worktree's
 * branch, and the Branch Check.
 */

const made: Array<string> = [];
const temp = () => {
  const path = realpathSync(mkdtempSync(join(tmpdir(), 'ai-worktrees-')));
  made.push(path);
  return path;
};
afterEach(() => {
  for (const path of made.splice(0))
    rmSync(path, { recursive: true, force: true });
});

const sh = (cwd: string, ...args: ReadonlyArray<string>) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Ada',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_NAME: 'Ada',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    },
  }).trim();

/** A clone on `main` of an Origin with `main` and `feature`, and the local `topic`. */
const clone = () => {
  const seed = temp();
  sh(seed, 'init', '-q', '-b', 'main');
  sh(seed, 'commit', '-q', '--allow-empty', '-m', 'first');
  sh(seed, 'branch', 'feature');
  const origin = join(temp(), 'origin.git');
  sh(seed, 'clone', '-q', '--bare', seed, origin);
  const path = join(temp(), 'repo');
  sh(seed, 'clone', '-q', origin, path);
  sh(path, 'branch', 'topic');
  return realpathSync(path);
};

const run = <A, E>(
  effect: (
    worktrees: string,
  ) => Effect.Effect<A, E, Engine | Store | Scope.Scope>,
  options: { readonly fake?: FakeHarness; readonly testClock?: boolean } = {},
) => {
  const worktrees = temp();
  const base = Layer.merge(
    storeLayer(':memory:'),
    (options.fake ?? makeFakeHarness()).layer,
  );
  const world = Layer.merge(
    base,
    Engine.layer({ attachments: temp(), home: temp(), worktrees }).pipe(
      Layer.provide(base),
    ),
  );
  return Effect.runPromise(
    Effect.scoped(effect(worktrees)).pipe(
      Effect.provide(world),
      Effect.provide(options.testClock ? TestClock.layer() : Layer.empty),
    ),
  );
};

/** What is in the folder `path`; nothing when there is none. */
const inside = (path: string) => (existsSync(path) ? readdirSync(path) : []);

const eventually = (assertion: () => Promise<void> | void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 5000, interval: 10 }));

/** Starts a Session in `projectId`, and the steps it reported. */
const start = (projectId: string, more: Partial<StartSession> = {}) =>
  Effect.gen(function* () {
    const engine = yield* Engine;
    const steps: Array<string> = [];
    const report = (step: StartStepReport) =>
      Effect.sync(() => void steps.push(`${step.step} ${step.state}`));
    const session = yield* engine.startSession(
      {
        projectId,
        account: 'claude',
        model: 'claude-test',
        settings: {},
        text: 'hello',
        attachments: [],
        ...more,
      },
      report,
    );
    return { session, steps };
  });

const stored = (id: string) =>
  Effect.flatMap(Store, (store) => store.session(id));

/** A Session as the Store holds it, read outside the engine's Effects. */
const saved = (store: Store['Service'], id: string) =>
  Effect.runPromise(store.session(id));

describe('a Session in a git Project', () => {
  it('lists the branches, an Origin branch a local one tracks only once', async () => {
    const repo = clone();
    await run(() =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(repo);
        expect(yield* engine.branches(project.id)).toEqual({
          _tag: 'Git',
          current: 'main',
          worktrees: [{ path: repo, branch: 'main' }],
          local: [
            { name: 'main', upstream: 'origin/main', worktree: repo },
            { name: 'topic', upstream: null, worktree: null },
          ],
          origin: ['origin/feature'],
        });
        const plain = yield* engine.addProject(temp());
        expect(yield* engine.branches(plain.id)).toEqual({ _tag: 'NotGit' });
        const missing = yield* Effect.exit(engine.branches('nope'));
        expect(Exit.isFailure(missing)).toBe(true);
      }),
    );
  });

  it('runs where the branch is out, or switches the folder to it first', async () => {
    const repo = clone();
    const fake = makeFakeHarness();
    await run(
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const project = yield* engine.addProject(repo);

          const here = yield* start(project.id, { branch: 'main' });
          expect(here.steps).toEqual([
            'startingAgent running',
            'startingAgent done',
          ]);
          expect(here.session).toMatchObject({
            worktree: repo,
            branch: 'main',
          });

          const switched = yield* start(project.id, {
            branch: 'origin/feature',
          });
          expect(switched.steps).toEqual([
            'switchingBranch running',
            'switchingBranch done',
            'startingAgent running',
            'startingAgent done',
          ]);
          expect(switched.session).toMatchObject({
            worktree: repo,
            branch: 'feature',
          });
          expect(sh(repo, 'branch', '--show-current')).toBe('feature');

          // A branch out in another Worktree: the Session runs there.
          const other = join(temp(), 'other');
          sh(repo, 'worktree', 'add', '-q', other, 'topic');
          const there = yield* start(project.id, { branch: 'topic' });
          expect(there.steps).toEqual([
            'startingAgent running',
            'startingAgent done',
          ]);
          expect(there.session).toMatchObject({
            worktree: realpathSync(other),
            branch: 'topic',
          });
          yield* eventually(() =>
            expect(fake.opens.map((open) => open.cwd)).toContain(
              realpathSync(other),
            ),
          );
        }),
      { fake },
    );
  });

  it('makes a new Worktree on ke-code/<id> from the branch picked', async () => {
    const repo = clone();
    const fake = makeFakeHarness();
    await run(
      (worktrees) =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const project = yield* engine.addProject(repo);
          const { session, steps } = yield* start(project.id, {
            branch: 'origin/feature',
            newWorktree: true,
          });
          const id = session.id.toLowerCase();
          const at = join(worktrees, project.id, id);
          expect(steps).toEqual([
            'makingWorktree running',
            'makingWorktree done',
            'startingAgent running',
            'startingAgent done',
          ]);
          expect(session).toMatchObject({
            worktree: at,
            branch: `ke-code/${id}`,
          });
          expect(sh(at, 'branch', '--show-current')).toBe(`ke-code/${id}`);
          expect(sh(at, 'rev-parse', 'HEAD')).toBe(
            sh(repo, 'rev-parse', 'origin/feature'),
          );
          // The Project's folder stays where it was.
          expect(sh(repo, 'branch', '--show-current')).toBe('main');
          expect((yield* stored(session.id))?.worktree).toBe(at);

          expect(yield* engine.branches(project.id)).toMatchObject({
            worktrees: [{ path: repo }, { path: at }],
          });

          // Its Fork runs in the same Worktree.
          const store = yield* Store;
          yield* eventually(async () =>
            expect(await saved(store, session.id)).toMatchObject({
              status: 'idle',
            }),
          );
          const fork = yield* engine.forkSession(session.id, null);
          expect(fork).toMatchObject({ worktree: at, branch: session.branch });
          expect(fake.forks.at(-1)?.cwd).toBe(at);
        }),
      { fake },
    );
  });

  it('starts nothing when a git step fails, and leaves no Worktree behind', async () => {
    const repo = clone();
    await run((worktrees) =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const project = yield* engine.addProject(repo);
        const made = yield* Effect.exit(
          start(project.id, { branch: 'nowhere', newWorktree: true }),
        );
        expect(made).toMatchObject({
          _tag: 'Failure',
          cause: {
            reasons: [{ error: { _tag: 'GitFailed', step: 'makingWorktree' } }],
          },
        });
        const switched = yield* Effect.exit(
          start(project.id, { branch: 'nowhere' }),
        );
        expect(switched).toMatchObject({
          _tag: 'Failure',
          cause: {
            reasons: [
              { error: { _tag: 'GitFailed', step: 'switchingBranch' } },
            ],
          },
        });
        expect((yield* store.allSessions).length).toBe(0);
        expect(inside(join(worktrees, project.id))).toEqual([]);
        expect(sh(repo, 'branch', '--list', 'ke-code/*')).toBe('');
      }),
    );
  });

  it('leaves a branch or folder that was there before a Worktree failed', async () => {
    const repo = clone();
    const ids = ['01J0Z8Q3VQ4N7Y2K5R6T8W9XAB', '01J0Z8Q3VQ4N7Y2K5R6T8W9XAC'];
    await run((worktrees) =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(repo);
        // As a start of the same id that crashed before would leave them.
        const branch = `ke-code/${ids[0]!.toLowerCase()}`;
        sh(repo, 'branch', branch);
        const folder = join(worktrees, project.id, ids[1]!.toLowerCase());
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, 'keep'), '');
        for (const id of ids) {
          const exit = yield* Effect.exit(
            start(project.id, { id, branch: 'main', newWorktree: true }),
          );
          expect(exit).toMatchObject({
            _tag: 'Failure',
            cause: {
              reasons: [
                { error: { _tag: 'GitFailed', step: 'makingWorktree' } },
              ],
            },
          });
        }
        expect(sh(repo, 'branch', '--list', branch)).not.toBe('');
        expect(existsSync(join(folder, 'keep'))).toBe(true);
      }),
    );
  });

  it('refuses a branch the Project does not list, one that reads as an option too', async () => {
    const repo = clone();
    await run((worktrees) =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(repo);
        for (const branch of ['--orphan=oops', '--detach', 'HEAD~1', 'nope'])
          for (const newWorktree of [false, true]) {
            const exit = yield* Effect.exit(
              start(project.id, { branch, newWorktree }),
            );
            expect(exit).toMatchObject({
              _tag: 'Failure',
              cause: { reasons: [{ error: { _tag: 'GitFailed' } }] },
            });
          }
        expect(sh(repo, 'branch', '--show-current')).toBe('main');
        expect(inside(join(worktrees, project.id))).toEqual([]);
        expect(sh(repo, 'branch', '--list', 'ke-code/*')).toBe('');
      }),
    );
  });

  it('refuses an Origin branch a local one of its name does not track, and lists it', async () => {
    const repo = clone();
    sh(repo, 'branch', '--no-track', 'feature', 'topic');
    await run(() =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(repo);
        expect(yield* engine.branches(project.id)).toMatchObject({
          origin: ['origin/feature'],
        });
        const exit = yield* Effect.exit(
          start(project.id, { branch: 'origin/feature' }),
        );
        expect(exit).toMatchObject({
          _tag: 'Failure',
          cause: {
            reasons: [
              { error: { _tag: 'GitFailed', step: 'switchingBranch' } },
            ],
          },
        });
        expect(sh(repo, 'branch', '--show-current')).toBe('main');
      }),
    );
  });

  it('runs in its folder, with no branch, in a Project that is not git', async () => {
    await run(() =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(temp());
        const { session, steps } = yield* start(project.id, {
          branch: 'main',
          newWorktree: true,
        });
        expect(steps).toEqual(['startingAgent running', 'startingAgent done']);
        expect(session).toMatchObject({ worktree: null, branch: null });
      }),
    );
  });

  it('names a new Worktree’s branch for its first Title, -2 when that is taken, once', async () => {
    const repo = clone();
    sh(repo, 'branch', 'ke-code/fix-the-login-bug');
    const fake = makeFakeHarness({ oneShot: 'Fix the login bug' });
    await run(
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const store = yield* Store;
          const project = yield* engine.addProject(repo);
          const { session } = yield* start(project.id, { newWorktree: true });
          yield* eventually(async () =>
            expect(await saved(store, session.id)).toMatchObject({
              title: 'Fix the login bug',
              branch: 'ke-code/fix-the-login-bug-2',
            }),
          );
          expect(sh(session.worktree!, 'branch', '--show-current')).toBe(
            'ke-code/fix-the-login-bug-2',
          );
          // A new Title leaves the branch as it is.
          yield* engine.regenerateTitle(session.id);
          expect((yield* stored(session.id))?.branch).toBe(
            'ke-code/fix-the-login-bug-2',
          );
        }),
      { fake },
    );
  });

  it('keeps a pushed branch’s name on the first Title', async () => {
    const repo = clone();
    const fake = makeFakeHarness({ oneShot: 'Fix the login bug' });
    await run(
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const store = yield* Store;
          const project = yield* engine.addProject(repo);
          const { session } = yield* start(project.id, { newWorktree: true });
          sh(session.worktree!, 'push', '-q', '-u', 'origin', session.branch!);
          yield* eventually(async () =>
            expect((await saved(store, session.id))?.title).toBe(
              'Fix the login bug',
            ),
          );
          expect(sh(session.worktree!, 'branch', '--show-current')).toBe(
            session.branch,
          );
          expect((yield* stored(session.id))?.branch).toBe(session.branch);
        }),
      { fake },
    );
  });

  it('keeps the branch its Worktree is on, read every minute', async () => {
    const repo = clone();
    await run(
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const project = yield* engine.addProject(repo);
          const { session } = yield* start(project.id, { branch: 'main' });
          sh(repo, 'switch', '-q', 'topic');
          // Each minute, as many as it takes the check to wait for the next.
          for (let minute = 0; minute < 50; minute++) {
            if ((yield* stored(session.id))?.branch === 'topic') break;
            yield* TestClock.adjust(EVERY);
            yield* Effect.promise(
              () => new Promise((done) => setTimeout(done, 20)),
            );
          }
          expect((yield* stored(session.id))?.branch).toBe('topic');
        }),
      { testClock: true },
    );
  });
});
