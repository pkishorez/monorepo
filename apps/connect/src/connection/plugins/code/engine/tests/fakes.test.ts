import { Effect, Layer, type Scope } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { harnessHostLayer } from '@kestack/ai-toolkit/harness/node';
import {
  makeFakeHarness,
  type FakeHarness,
} from '@kestack/ai-toolkit/harness/fake';
import {
  Engine,
  FileSystem,
  Store,
  type StartSession,
  type StartStepReport,
} from '../index.js';
import { storeLayer } from '../node.js';
import {
  fileSystem,
  GIT_FAILS_NEXT,
  HOME,
  type FileSystemMessage,
} from '../services/file-system/fake/index.js';
import { fakeGit } from '../services/git/fake/index.js';

/*
 * The real engine over the File System fake and the Git fake, as a browser
 * tab runs it: the Project Picker's folders, a sample project's branches,
 * a start that switches its folder or makes a Worktree, its first Title
 * naming that Worktree's branch, and the fake's Controls changing what the
 * engine finds: an Origin branch, the next git step failing, git missing.
 */

const SHOP = `${HOME}/code/shop`;
const WORKTREES = '/var/kestack/worktrees';

const opened: Array<Runtime<typeof fileSystem.actor>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((runtime) => runtime.dispose()));
});

/** A fake computer with the sample project at `~/code/shop`, and the engine over it. */
const computer = (fake: FakeHarness = makeFakeHarness()) => {
  const runtime = Runtime.make(fileSystem.actor);
  opened.push(runtime);
  const control = (message: FileSystemMessage) =>
    expect(runtime.root.send(message)).toBe('handled');
  control({ _tag: 'AddSampleProject', folder: '~/code/shop' });
  const files = fileSystem.serve(runtime);
  const edges = Layer.mergeAll(
    files,
    fakeGit.pipe(Layer.provide(files)),
    harnessHostLayer,
  );
  const base = Layer.merge(storeLayer(':memory:'), fake.layer);
  const world = Layer.mergeAll(
    base,
    files,
    Engine.layer({
      attachments: '/var/kestack/attachments',
      worktrees: WORKTREES,
    }).pipe(Layer.provide(Layer.merge(base, edges))),
  );
  const run = <A, E>(
    effect: Effect.Effect<A, E, Engine | Store | FileSystem | Scope.Scope>,
  ) => Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(world)));
  /** What is in the folder at `path`, name-sorted; nothing when there is none. */
  const inside = (path: string) =>
    Object.keys(runtime.root.model.tree)
      .filter((at) => at.startsWith(`${path}/`))
      .map((at) => at.slice(path.length + 1))
      .filter((name) => !name.includes('/'))
      .sort();
  /** The text of the file at `path` in the fake tree. */
  const text = (path: string) => {
    const entry = runtime.root.model.tree[path];
    return entry?._tag === 'File' ? entry.data : null;
  };
  return { runtime, control, run, inside, text };
};

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

describe('the engine over the File System and Git fakes', () => {
  it("lists home's folders, and makes one", async () => {
    const { control, run } = computer();
    control({ _tag: 'AddHiddenFolder', in: '~/code', name: 'cache' });
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        expect(yield* engine.listFolder({ path: '~/code' })).toEqual({
          path: `${HOME}/code`,
          parent: HOME,
          folders: [{ name: 'shop', hidden: false, link: false }],
          truncated: false,
        });
        expect(
          yield* engine.createFolder({ parent: '~/code', name: 'new' }),
        ).toEqual({ path: `${HOME}/code/new` });
      }),
    );
  });

  it("lists the sample project's branches, an Origin branch a local one tracks only once", async () => {
    const { control, run } = computer();
    control({ _tag: 'AddFolder', folder: '~/plain' });
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(SHOP);
        expect(yield* engine.branches(project.id)).toEqual({
          _tag: 'Git',
          current: 'main',
          worktrees: [{ path: SHOP, branch: 'main' }],
          local: [
            {
              name: 'feature/sign-in',
              upstream: 'origin/feature/sign-in',
              worktree: null,
            },
            { name: 'fix/typo', upstream: null, worktree: null },
            { name: 'main', upstream: 'origin/main', worktree: SHOP },
          ],
          origin: ['origin/release/1.0'],
        });
        const plain = yield* engine.addProject(`${HOME}/plain`);
        expect(yield* engine.branches(plain.id)).toEqual({ _tag: 'NotGit' });
      }),
    );
  });

  it('lists an Origin branch once a Branch Picker open fetched it', async () => {
    const { control, run } = computer();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(SHOP);
        control({
          _tag: 'AddOriginBranch',
          project: '~/code/shop',
          branch: 'next',
        });
        expect(yield* engine.branches(project.id)).toMatchObject({
          origin: ['origin/release/1.0'],
        });
        yield* eventually(async () =>
          expect(
            await Effect.runPromise(engine.branches(project.id)),
          ).toMatchObject({ origin: ['origin/next', 'origin/release/1.0'] }),
        );
      }),
    );
  });

  it('reads the project as not git while git is missing', async () => {
    const { control, run } = computer();
    control({ _tag: 'MakeGitMissing' });
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(SHOP);
        expect(yield* engine.branches(project.id)).toEqual({ _tag: 'NotGit' });
        const { session, steps } = yield* start(project.id);
        expect(steps).toEqual(['startingAgent running', 'startingAgent done']);
        expect(session).toMatchObject({ worktree: null, branch: null });
      }),
    );
  });

  it('switches the folder to an Origin branch through a local one that tracks it', async () => {
    const { run, text } = computer();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const project = yield* engine.addProject(SHOP);
        const { session, steps } = yield* start(project.id, {
          branch: 'origin/release/1.0',
        });
        expect(steps).toEqual([
          'switchingBranch running',
          'switchingBranch done',
          'startingAgent running',
          'startingAgent done',
        ]);
        expect(session).toMatchObject({
          worktree: SHOP,
          branch: 'release/1.0',
        });
        expect(text(`${SHOP}/.git/HEAD`)).toBe('ref: refs/heads/release/1.0\n');
      }),
    );
  });

  it('makes a new Worktree, its branch named for the first Title, and its Session runs in it', async () => {
    const fake = makeFakeHarness({ oneShot: 'Fix the login bug' });
    const { run, text } = computer(fake);
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const project = yield* engine.addProject(SHOP);
        const { session, steps } = yield* start(project.id, {
          branch: 'origin/feature/sign-in',
          newWorktree: true,
        });
        const id = session.id.toLowerCase();
        const at = `${WORKTREES}/${project.id}/${id}`;
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
        expect(text(`${at}/README.md`)).toBe(text(`${SHOP}/README.md`));
        expect(text(`${SHOP}/.git/HEAD`)).toBe('ref: refs/heads/main\n');
        yield* eventually(() =>
          expect(fake.opens.map((open) => open.cwd)).toContain(at),
        );
        yield* eventually(async () =>
          expect(
            await Effect.runPromise(store.session(session.id)),
          ).toMatchObject({
            title: 'Fix the login bug',
            branch: 'ke-code/fix-the-login-bug',
          }),
        );
        expect(text(`${SHOP}/.git/worktrees/${id}/HEAD`)).toBe(
          'ref: refs/heads/ke-code/fix-the-login-bug\n',
        );
        expect(yield* engine.branches(project.id)).toMatchObject({
          worktrees: [
            { path: SHOP, branch: 'main' },
            { path: at, branch: 'ke-code/fix-the-login-bug' },
          ],
        });
      }),
    );
  });

  it('starts nothing when the next git step fails, and leaves no Worktree behind', async () => {
    const { control, run, inside, text } = computer();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const store = yield* Store;
        const project = yield* engine.addProject(SHOP);
        control({ _tag: 'MakeNextGitStepFail', message: 'fatal: disk full' });
        const made = yield* Effect.exit(
          start(project.id, { branch: 'main', newWorktree: true }),
        );
        expect(made).toMatchObject({
          _tag: 'Failure',
          cause: {
            reasons: [
              {
                error: {
                  _tag: 'GitFailed',
                  step: 'makingWorktree',
                  message: 'fatal: disk full',
                },
              },
            ],
          },
        });
        expect((yield* store.allSessions).length).toBe(0);
        expect(inside(`${WORKTREES}/${project.id}`)).toEqual([]);
        expect(inside(`${SHOP}/.git/refs/heads`)).toEqual([
          'feature',
          'fix',
          'main',
        ]);
        expect(text(GIT_FAILS_NEXT)).toBeNull();
        // The step after it runs.
        const { session } = yield* start(project.id, {
          branch: 'main',
          newWorktree: true,
        });
        expect(session.worktree).toContain(WORKTREES);
      }),
    );
  });
});
