import type { Walk } from '../walker.ts';
import type { Scenario } from './index.ts';
import { DISK } from './projects.ts';
import { replyWith, send } from './sessions.ts';

/*
 * Starting a session on another branch, over the Git fake (git's state in
 * Studio's File System): a local branch switches the main Worktree; an
 * Origin branch is checked out, tracking it; a New Worktree is made on
 * `ke-code/<id>` and renamed for its Title.
 */

/** A new session's page in shop, from the sidebar's +. */
const newSession = async (walk: Walk) => {
  await walk.bubble.close();
  await walk.page
    .getByRole('complementary')
    .getByRole('link', { name: /^shop .*New session$/ })
    .click();
  await walk.button(/^Branch: /).waitFor();
};

/** Picks a branch in the Branch Picker, by the start of its row. */
const pickBranch = async (walk: Walk, branch: RegExp) => {
  await walk.button(/^Branch: /).click();
  const picker = walk.page.getByRole('dialog', { name: 'Branch' });
  await picker.getByRole('option', { name: branch }).click();
  await picker.waitFor({ state: 'detached' });
};

export const branches: Scenario = {
  name: 'branches',
  title: 'A session on a local branch, an Origin branch, a New Worktree',
  needs: ['sessions'],
  run: async (walk) => {
    const { page, bubble } = walk;
    await replyWith(walk, 'echo');

    walk.step('a local branch, New Worktree off: the folder switches to it');
    await newSession(walk);
    await pickBranch(walk, /^feature\/sign-in/);
    await walk.see('feature/sign-in', walk.main);
    await walk.shot('local-branch-picked');
    await send(page, 'Work on sign-in');
    await walk.see('echo: Work on sign-in');
    const sidebar = page.getByRole('complementary');
    await sidebar
      .getByRole('link', { name: /^shop feature\/sign-in New session$/ })
      .waitFor();
    await walk.shot('on-local-branch');

    walk.step('an Origin branch: checked out locally, tracking it');
    await newSession(walk);
    await pickBranch(walk, /^origin\/release\/1\.0/);
    await walk.shot('origin-branch-picked');
    await send(page, 'Prepare the release');
    await walk.see('echo: Prepare the release');
    await sidebar
      .getByRole('link', { name: /^shop release\/1\.0 New session$/ })
      .waitFor();
    await walk.shot('on-origin-branch');
    await newSession(walk);
    await walk.see('tracks origin/release/1.0', walk.main);
    await walk.shot('origin-branch-tracked');

    walk.step('New Worktree: made on ke-code/<id>, renamed for its Title');
    await bubble.must('Agent', 'Title next', { title: 'Fix the login page' });
    await bubble.close();
    await walk.page.getByRole('switch', { name: 'New worktree' }).click();
    await walk.shot('new-worktree-on');
    await send(page, 'Fix the login page');
    await walk.see('echo: Fix the login page');
    await sidebar
      .getByRole('link', {
        name: /^Fix the login page Worktree fix-the-login-page/,
      })
      .waitFor();
    await walk.shot('in-worktree');
    const tree = await bubble.model(DISK, ['tree']);
    const heads = tree.match(/\/\.git\/refs\/heads\/ke-code\/[^:]+/g) ?? [];
    console.log(`  git: ${heads.join(', ')}`);
    if (!heads.some((head) => head.endsWith('ke-code/fix-the-login-page')))
      throw new Error('No ke-code/fix-the-login-page branch in shop');
    if (!/\/\.git\/worktrees\//.test(tree))
      throw new Error('No linked Worktree in shop');
    await bubble.host
      .locator('span.k', { hasText: '/.git/worktrees/' })
      .first()
      .scrollIntoViewIfNeeded();
    await walk.shot('worktree-in-bubble', { bubble: true });
  },
};
