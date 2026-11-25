import { Effect, Layer, type Scope, SubscriptionRef } from 'effect';
import { describe, expect, it, vi } from 'vitest';
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
  addFolder,
  addSampleProject,
  diskOf,
  type DiskChange,
  emptyHome,
  fileSystemOver,
  HOME,
  originOf,
  shaOf,
} from '../services/file-system/fake/index.js';
import { fakeGit } from '../services/git/fake/index.js';

/*
 * The real engine over the File System fake and the Git fake, as a browser
 * tab runs it: the Project Picker's folders, a sample project's branches,
 * a start that switches its folder or makes a Worktree, its first Title
 * naming that Worktree's branch, and a branch pushed to Origin elsewhere
 * found once fetched.
 */

const SHOP = `${HOME}/code/shop`;
const WORKTREES = '/var/kestack/worktrees';

/** A fake computer with the sample project at `~/code/shop`, and the engine over it. */
const computer = (fake: FakeHarness = makeFakeHarness()) => {
  const disk = Effect.runSync(SubscriptionRef.make(emptyHome));
  const control = (change: DiskChange) =>
    Effect.runSync(SubscriptionRef.update(disk, change));
  control(addSampleProject('~/code/shop'));
  const files = fileSystemOver(diskOf(disk));
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
  /** The text of the file at `path` in the fake tree. */
  const text = (path: string) => {
    const entry = SubscriptionRef.getUnsafe(disk).tree[path];
    return entry?._tag === 'File' ? entry.data : null;
  };
  return { disk, control, run, text };
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
    control(addFolder('~/code/.cache'));
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
    control(addFolder('~/plain'));
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
    const { run } = computer();
    await run(
      Effect.gen(function* () {
        const engine = yield* Engine;
        const files = yield* FileSystem;
        const project = yield* engine.addProject(SHOP);
        // Pushed to Origin from elsewhere.
        yield* files.writeFile(
          `${originOf(SHOP)}/refs/heads/next`,
          `${shaOf('next')}\n`,
        );
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
});
