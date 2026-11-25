import { Effect, Exit, Layer, type Scope } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime } from '@kestack/kabuki';
import { FileSystem, Git } from '../../../../capabilities/index.js';
import { dirname } from '../../../../paths/index.js';
import {
  fileSystem,
  HOME,
  originOf,
  shaOf,
  type FileSystemMessage,
} from '../../../file-system/fake/index.js';
import { fakeGit } from '../index.js';

/*
 * The Git fake over the File System fake's sample project: what each
 * question answers and each change leaves in `.git`, as git would on that
 * layout. What git outside Code does (a branch made, switched or pushed)
 * is written into `.git` and Origin through the File System, as git would.
 */

const SHOP = `${HOME}/code/shop`;
const WORKTREES = '/var/kestack/worktrees';

const opened: Array<Runtime<typeof fileSystem.actor>> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((runtime) => runtime.dispose()));
});

type Use<A, E> = (
  git: Git['Service'],
  files: FileSystem['Service'],
) => Effect.Effect<A, E, Scope.Scope>;

/** A fake computer with the sample project at `~/code/shop`, and Git over it. */
const computer = () => {
  const runtime = Runtime.make(fileSystem.actor);
  opened.push(runtime);
  const control = (message: FileSystemMessage) =>
    expect(runtime.root.send(message)).toBe('handled');
  control({ _tag: 'AddSampleProject', folder: '~/code/shop' });
  const layer = fakeGit.pipe(Layer.provideMerge(fileSystem.serve(runtime)));
  const run = <A, E>(use: Use<A, E>) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(Effect.all([Git, FileSystem]), ([git, files]) =>
          use(git, files),
        ),
      ).pipe(Effect.provide(layer)),
    );
  const exit = <A, E>(use: Use<A, E>) =>
    run((git, files) => Effect.exit(use(git, files)));
  const ask = <A, E>(use: (git: Git['Service']) => Effect.Effect<A, E>) =>
    run((git) => use(git));
  const text = (path: string) =>
    run((_, files) => files.readFile(path)).then((bytes) =>
      new TextDecoder().decode(bytes),
    );
  const isThere = (path: string) =>
    run((_, files) =>
      Effect.match(files.stat(path), {
        onFailure: () => false,
        onSuccess: () => true,
      }),
    );
  /** Writes the file at `path`, the folders on the way made, as git outside Code would. */
  const write = (path: string, data: string) =>
    run((_, files) =>
      Effect.andThen(
        files.mkdir(dirname(path), { recursive: true }),
        files.writeFile(path, data),
      ),
    );
  /** A local branch `branch` made outside Code, on a commit of its own. */
  const addBranch = (branch: string) =>
    write(`${SHOP}/.git/refs/heads/${branch}`, `${shaOf(branch)}\n`);
  return { runtime, control, run, exit, ask, text, isThere, write, addBranch };
};

/** The message a failed Exit's GitError carries. */
const messageOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit)
    ? (exit.cause.reasons[0] as { error?: { message?: string } } | undefined)
        ?.error?.message
    : undefined;

describe('the Git fake reading the sample project', () => {
  it('reads a folder in no repository, or not there, as not git', async () => {
    const { control, ask } = computer();
    control({ _tag: 'AddFolder', folder: '~/plain' });
    for (const path of [`${HOME}/plain`, `${HOME}/plain/gone`]) {
      expect(await ask((git) => git.top(path))).toBeNull();
      expect(await ask((git) => git.branches(path))).toBeNull();
      expect(await ask((git) => git.branchAt(path))).toBeNull();
    }
  });

  it('reads a folder inside the repository as its repository, from its top', async () => {
    const { control, ask } = computer();
    control({ _tag: 'AddFolder', folder: '~/code/shop/packages/one' });
    const inside = `${SHOP}/packages/one`;
    expect(await ask((git) => git.top(inside))).toBe(SHOP);
    expect(await ask((git) => git.top(SHOP))).toBe(SHOP);
    expect(await ask((git) => git.branches(inside))).toEqual(
      await ask((git) => git.branches(SHOP)),
    );
    expect(await ask((git) => git.branchAt(inside))).toBe('main');
  });

  it('lists local branches with what they track, Origin branches, and the Worktrees', async () => {
    const { ask } = computer();
    expect(await ask((git) => git.branches(SHOP))).toEqual({
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
      origin: ['origin/feature/sign-in', 'origin/main', 'origin/release/1.0'],
    });
  });

  it('follows a branch switched, or added, outside Code', async () => {
    const { ask, write, addBranch } = computer();
    await addBranch('spike');
    await write(`${SHOP}/.git/HEAD`, 'ref: refs/heads/spike\n');
    expect(await ask((git) => git.branchAt(SHOP))).toBe('spike');
    await addBranch('docs');
    const found = await ask((git) => git.branches(SHOP));
    expect(found?.current).toBe('spike');
    expect(found?.local.map((each) => each.name)).toEqual([
      'docs',
      'feature/sign-in',
      'fix/typo',
      'main',
      'spike',
    ]);
  });
});

describe('the Git fake changing the sample project', () => {
  it('switches to a local branch, and to an Origin one through a local one that tracks it', async () => {
    const { ask, exit, text } = computer();
    expect(await ask((git) => git.switchTo(SHOP, 'fix/typo'))).toEqual({
      made: null,
    });
    expect(await ask((git) => git.branchAt(SHOP))).toBe('fix/typo');
    const { made } = await ask((git) =>
      git.switchTo(SHOP, 'origin/release/1.0'),
    );
    expect(made).toEqual({
      name: 'release/1.0',
      at: (await text(`${originOf(SHOP)}/refs/heads/release/1.0`)).trim(),
    });
    expect(await ask((git) => git.branchAt(SHOP))).toBe('release/1.0');
    expect(
      (await ask((git) => git.branches(SHOP)))?.local.find(
        (each) => each.name === 'release/1.0',
      ),
    ).toEqual({
      name: 'release/1.0',
      upstream: 'origin/release/1.0',
      worktree: SHOP,
    });
    // A local branch tracks it: that one is switched to.
    expect(await ask((git) => git.switchTo(SHOP, 'origin/main'))).toEqual({
      made: null,
    });
    expect(await ask((git) => git.branchAt(SHOP))).toBe('main');
    for (const branch of ['nowhere', 'origin/nowhere', '--detach', '-'])
      expect(
        Exit.isFailure(await exit((git) => git.switchTo(SHOP, branch))),
      ).toBe(true);
    expect(await ask((git) => git.branchAt(SHOP))).toBe('main');
  });

  it('refuses an Origin branch whose name a local branch that does not track it has', async () => {
    const { ask, exit, addBranch } = computer();
    await addBranch('release/1.0');
    const refused = await exit((git) =>
      git.switchTo(SHOP, 'origin/release/1.0'),
    );
    expect(messageOf(refused)).toContain('release/1.0');
    expect(await ask((git) => git.branchAt(SHOP))).toBe('main');
  });

  it('makes a Worktree as git does, on a new branch from a local one or an Origin one, tracking nothing', async () => {
    const { ask, text, isThere } = computer();
    const one = `${WORKTREES}/p1/one`;
    const two = `${WORKTREES}/p1/two`;
    expect(
      await ask((git) =>
        git.addWorktree(SHOP, {
          at: one,
          branch: 'ke-code/one',
          from: 'fix/typo',
        }),
      ),
    ).toEqual({
      name: 'ke-code/one',
      at: (await text(`${SHOP}/.git/refs/heads/fix/typo`)).trim(),
    });
    await ask((git) =>
      git.addWorktree(SHOP, {
        at: two,
        branch: 'ke-code/two',
        from: 'origin/feature/sign-in',
      }),
    );
    expect(await text(`${one}/.git`)).toBe(
      `gitdir: ${SHOP}/.git/worktrees/one\n`,
    );
    expect(await text(`${SHOP}/.git/worktrees/one/HEAD`)).toBe(
      'ref: refs/heads/ke-code/one\n',
    );
    expect(await text(`${SHOP}/.git/worktrees/one/gitdir`)).toBe(
      `${one}/.git\n`,
    );
    expect(await text(`${SHOP}/.git/worktrees/one/commondir`)).toBe('../..\n');
    // Its files are the repository's.
    expect(await text(`${one}/README.md`)).toBe(
      await text(`${SHOP}/README.md`),
    );
    expect(await text(`${one}/src/index.ts`)).toBe(
      await text(`${SHOP}/src/index.ts`),
    );

    expect(await ask((git) => git.top(one))).toBe(one);
    expect(await ask((git) => git.branchAt(one))).toBe('ke-code/one');
    expect(await ask((git) => git.branchAt(two))).toBe('ke-code/two');
    const found = await ask((git) => git.branches(SHOP));
    expect(found?.worktrees).toEqual([
      { path: SHOP, branch: 'main' },
      { path: one, branch: 'ke-code/one' },
      { path: two, branch: 'ke-code/two' },
    ]);
    expect(found?.local).toContainEqual({
      name: 'ke-code/two',
      upstream: null,
      worktree: two,
    });
    // Asked from a Worktree, that one comes first.
    const fromOne = await ask((git) => git.branches(one));
    expect(fromOne?.current).toBe('ke-code/one');
    expect(fromOne?.worktrees[0]).toEqual({ path: one, branch: 'ke-code/one' });

    await ask((git) => git.removeWorktree(SHOP, one));
    expect(await isThere(one)).toBe(false);
    expect(await isThere(`${SHOP}/.git/worktrees/one`)).toBe(false);
    expect(await isThere(`${SHOP}/.git/refs/heads/ke-code/one`)).toBe(true);
    expect(
      (await ask((git) => git.branches(SHOP)))?.worktrees.map(
        (each) => each.path,
      ),
    ).toEqual([SHOP, two]);
  });

  it('refuses a Worktree from a branch there is not, or where its branch or folder is, and leaves them be', async () => {
    const { control, exit, isThere, addBranch } = computer();
    const at = `${WORKTREES}/p1/one`;
    for (const from of ['nowhere', '--detach'])
      expect(
        Exit.isFailure(
          await exit((git) =>
            git.addWorktree(SHOP, { at, branch: 'ke-code/one', from }),
          ),
        ),
      ).toBe(true);
    expect(await isThere(at)).toBe(false);
    expect(await isThere(`${SHOP}/.git/refs/heads/ke-code/one`)).toBe(false);

    await addBranch('ke-code/one');
    expect(
      Exit.isFailure(
        await exit((git) =>
          git.addWorktree(SHOP, { at, branch: 'ke-code/one', from: 'main' }),
        ),
      ),
    ).toBe(true);
    expect(await isThere(`${SHOP}/.git/refs/heads/ke-code/one`)).toBe(true);

    const two = `${WORKTREES}/p1/two`;
    control({ _tag: 'AddFile', file: `${two}/keep`, text: '' });
    expect(
      Exit.isFailure(
        await exit((git) =>
          git.addWorktree(SHOP, {
            at: two,
            branch: 'ke-code/two',
            from: 'main',
          }),
        ),
      ),
    ).toBe(true);
    expect(await isThere(`${two}/keep`)).toBe(true);
    expect(await isThere(`${SHOP}/.git/refs/heads/ke-code/two`)).toBe(false);
  });

  it('drops a branch it made only while it is out nowhere and still where it was made', async () => {
    const { ask, run, isThere } = computer();
    const { made } = await ask((git) =>
      git.switchTo(SHOP, 'origin/release/1.0'),
    );
    const ref = `${SHOP}/.git/refs/heads/release/1.0`;
    // Out in the folder, it stays.
    await ask((git) => git.dropBranch(SHOP, made!));
    expect(await isThere(ref)).toBe(true);
    await ask((git) => git.switchTo(SHOP, 'main'));
    // On another commit, it stays.
    await run((_, files) => files.writeFile(ref, `${'0'.repeat(40)}\n`));
    await ask((git) => git.dropBranch(SHOP, made!));
    expect(await isThere(ref)).toBe(true);
    await run((_, files) => files.writeFile(ref, `${made!.at}\n`));
    await ask((git) => git.dropBranch(SHOP, made!));
    expect(await isThere(ref)).toBe(false);
  });

  it('renames a branch to the first free name, and says whether one was pushed', async () => {
    const { ask, text, write, addBranch } = computer();
    const at = `${WORKTREES}/p1/one`;
    await ask((git) =>
      git.addWorktree(SHOP, { at, branch: 'ke-code/one', from: 'main' }),
    );
    expect(await ask((git) => git.pushed(at, 'ke-code/one'))).toBe(false);
    await addBranch('ke-code/fix-login');
    expect(
      await ask((git) => git.rename(at, 'ke-code/one', 'ke-code/fix-login')),
    ).toBe('ke-code/fix-login-2');
    expect(await ask((git) => git.branchAt(at))).toBe('ke-code/fix-login-2');
    expect(await text(`${SHOP}/.git/worktrees/one/HEAD`)).toBe(
      'ref: refs/heads/ke-code/fix-login-2\n',
    );

    // Tracking a branch, or with one of its name on Origin, it was pushed.
    expect(await ask((git) => git.pushed(SHOP, 'main'))).toBe(true);
    expect(await ask((git) => git.pushed(SHOP, 'fix/typo'))).toBe(false);
    // Pushed outside Code: Origin has it, and so does `refs/remotes/origin`.
    const typo = await text(`${SHOP}/.git/refs/heads/fix/typo`);
    await write(`${originOf(SHOP)}/refs/heads/fix/typo`, typo);
    await write(`${SHOP}/.git/refs/remotes/origin/fix/typo`, typo);
    expect(await ask((git) => git.pushed(SHOP, 'fix/typo'))).toBe(true);
    // Git that cannot say reads as pushed, so nothing is renamed.
    expect(await ask((git) => git.pushed(HOME, 'fix/typo'))).toBe(true);
  });

  it('renames two branches to one name at once, each to a free one', async () => {
    const { ask } = computer();
    const ats = ['one', 'two', 'three', 'four'].map((id) => ({
      at: `${WORKTREES}/p1/${id}`,
      branch: `ke-code/${id}`,
    }));
    for (const each of ats)
      await ask((git) => git.addWorktree(SHOP, { ...each, from: 'main' }));
    const names = await ask((git) =>
      Effect.all(
        ats.map(({ at, branch }) => git.rename(at, branch, 'ke-code/fix')),
        { concurrency: 'unbounded' },
      ),
    );
    expect([...names].sort()).toEqual([
      'ke-code/fix',
      'ke-code/fix-2',
      'ke-code/fix-3',
      'ke-code/fix-4',
    ]);
  });

  it("fetches Origin's branches in the background, and drops those Origin no longer has", async () => {
    const { run, ask, write } = computer();
    // Pushed to Origin from elsewhere.
    await write(`${originOf(SHOP)}/refs/heads/next`, `${shaOf('next')}\n`);
    expect((await ask((git) => git.branches(SHOP)))?.origin).not.toContain(
      'origin/next',
    );
    await run((_, files) =>
      files.remove(`${originOf(SHOP)}/refs/heads/release/1.0`),
    );
    await run((git) =>
      Effect.gen(function* () {
        yield* git.fetch(SHOP);
        // A second one while it runs is dropped.
        yield* git.fetch(SHOP);
        for (let tries = 0; tries < 100; tries++) {
          const origin = (yield* git.branches(SHOP))?.origin ?? [];
          if (origin.includes('origin/next')) return;
          yield* Effect.sleep('10 millis');
        }
        throw new Error('Never fetched');
      }),
    );
    expect((await ask((git) => git.branches(SHOP)))?.origin).toEqual([
      'origin/feature/sign-in',
      'origin/main',
      'origin/next',
    ]);
  });
});
