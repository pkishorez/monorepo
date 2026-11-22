import type { Walk } from '../walker.ts';
import { COMPUTER } from './home.ts';
import type { Scenario } from './index.ts';
import { DISK } from './projects.ts';
import { replyWith, send } from './sessions.ts';

/*
 * A new session's page on shop, over the Git fake and the Agent fake: git
 * missing reads as no repository; each Branch Picker open fetches Origin
 * behind; a branch switched outside Code followed by the sidebar (the
 * Folder Check) and by the Branch row once the page opens again. Starting:
 * each step shown running then done; a git step failing, the agent failing
 * to open, and an agent account removed from another device each leave no
 * Session and the Draft as it was, saying why. A Worktree's branch pushed
 * before its Title keeps its id name. The answer to a start lost as the
 * tunnel moves: the app moves once the Session shows; a restart mid-start,
 * where it never shows, the Draft says why.
 */

/** The Folder Check looks every minute. */
const FOLDER_CHECK = 70_000;

/** shop's new session page, from home: the Draft read afresh. */
const newSession = async (walk: Walk) => {
  await walk.bubble.close();
  await walk.go(walk.kept.get('shop')!);
  await walk.button(/^Branch: /).waitFor();
};

const draftOf = (walk: Walk) =>
  walk.page
    .getByRole('textbox', { name: /^(First message|Message)$/ })
    .filter({ visible: true })
    .first();

/** Empties the Draft. */
const clear = async (walk: Walk) => {
  await draftOf(walk).click();
  await walk.page.keyboard.press('Control+a');
  await walk.page.keyboard.press('Backspace');
};

/** The Branch Picker's rows, opened from the Branch row and closed again. */
const branchRows = async (walk: Walk) => {
  await walk.button(/^Branch: /).click();
  const picker = walk.page.getByRole('dialog', { name: 'Branch' });
  await picker.getByRole('option').first().waitFor();
  await walk.page.waitForTimeout(500);
  const rows = await picker.getByRole('option').allInnerTexts();
  return { picker, rows: rows.map((row) => row.split('\n')[0]) };
};

const pickBranch = async (walk: Walk, branch: RegExp) => {
  await walk.button(/^Branch: /).click();
  const picker = walk.page.getByRole('dialog', { name: 'Branch' });
  await picker.getByRole('option', { name: branch }).click();
  await picker.waitFor({ state: 'detached' });
};

/** Sends the Draft; it stays on this page, saying `why`, its text kept. */
const refused = async (walk: Walk, text: string, why: string | RegExp) => {
  const at = walk.page.url();
  await send(walk.page, text);
  await walk.see(why, walk.main);
  if (walk.page.url() !== at) throw new Error('The page moved');
  if (!(await draftOf(walk).innerText()).includes(text))
    throw new Error('The Draft lost its text');
  const sidebar = await walk.page.getByRole('complementary').innerText();
  if (sidebar.includes(text)) throw new Error(`A Session "${text}" was made`);
};

/** Follows the steps a start shows, every change; read them later. */
const followSteps = async (walk: Walk) => {
  await walk.page.evaluate(() => {
    const seen: Array<string> = [];
    const note = () => {
      const shown = document.querySelector(
        '[aria-label="Starting the session"]',
      );
      if (shown === null) return;
      const now = Array.from(shown.querySelectorAll('li'))
        .map((step) => step.textContent)
        .join(' / ');
      if (seen.at(-1) !== now) seen.push(now);
    };
    new MutationObserver(note).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    (window as unknown as { walkSteps: Array<string> }).walkSteps = seen;
  });
  return () =>
    walk.page.evaluate(
      () => (window as unknown as { walkSteps: Array<string> }).walkSteps,
    );
};

export const repos: Scenario = {
  name: 'repos',
  title:
    "A new session's page: git missing, Origin, outside Code, starts that fail",
  needs: ['projects'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const sidebar = page.getByRole('complementary');
    await replyWith(walk, 'echo');
    await bubble.must(DISK, 'Switch branch', {
      project: '~/code/shop',
      branch: 'main',
    });

    walk.step('git missing: as a folder that is no repository');
    await bubble.must(DISK, 'Make git missing');
    await bubble.close();
    await walk.go(walk.kept.get('shop')!);
    await walk.see('Not a git repository', walk.main);
    if ((await walk.button(/^Branch: /).count()) > 0)
      throw new Error('A Branch row with git missing');
    await walk.shot('git-missing');
    await bubble.must(DISK, 'Install git');
    await newSession(walk);

    walk.step(
      'each Branch Picker open fetches Origin; the next lists what came',
    );
    await bubble.must(DISK, 'Add origin branch', {
      project: '~/code/shop',
      branch: 'feature/from-origin',
    });
    await bubble.close();
    const before = await branchRows(walk);
    await page.keyboard.press('Escape');
    await before.picker.waitFor({ state: 'detached' });
    if (before.rows.includes('origin/feature/from-origin'))
      throw new Error('Listed before a fetch');
    const after = await branchRows(walk);
    console.log(`  second open: ${after.rows.join(', ')}`);
    if (!after.rows.includes('origin/feature/from-origin'))
      throw new Error('Not listed after a fetch');
    await walk.shot('origin-fetched');
    await page.keyboard.press('Escape');
    await after.picker.waitFor({ state: 'detached' });

    walk.step(
      'switched outside Code: the sidebar follows; the Branch row once opened again',
    );
    await send(page, 'On main');
    await walk.see('echo: On main');
    await page.waitForURL(/\/s\//);
    await bubble.must(DISK, 'Switch branch', {
      project: '~/code/shop',
      branch: 'fix/typo',
    });
    await bubble.close();
    const switched = Date.now();
    await sidebar
      .getByRole('link', { name: /^shop fix\/typo New session$/ })
      .waitFor({ timeout: FOLDER_CHECK });
    console.log(`  sidebar on fix/typo after ${Date.now() - switched} ms`);
    await walk.shot('switched-sidebar');
    await newSession(walk);
    await walk.button('Branch: fix/typo').waitFor();
    await walk.shot('switched-branch-row');

    walk.step('a git step fails: no Session, the Draft back, git saying why');
    await pickBranch(walk, /^feature\/sign-in/);
    await bubble.must(DISK, 'Make next git step fail', {
      message: 'fatal: Unable to create index.lock: File exists.',
    });
    await bubble.close();
    await refused(
      walk,
      'Work on a locked repo',
      /Unable to create index\.lock/,
    );
    await walk.shot('git-step-failed');

    walk.step(
      'starting: each step running, then done, where the transcript will be',
    );
    await bubble.must('Agent', 'Opens slowly', { harness: 'claude', ms: 2000 });
    await bubble.close();
    const steps = await followSteps(walk);
    await draftOf(walk).click();
    await page.keyboard.press('Control+Enter');
    await walk.see(/Starting the agent/, walk.main);
    await walk.shot('starting');
    await walk.see('echo: Work on a locked repo');
    // On the Session's page before the next page is asked for.
    await page.waitForURL(/\/s\//);
    const shown = await steps();
    console.log(`  steps: ${shown.join(' → ')}`);
    if (
      !shown.includes('Switching to feature/sign-in, running') ||
      !shown.some((now) => now.endsWith('Starting the agent, running')) ||
      !shown.at(-1)!.endsWith('Starting the agent, done')
    )
      throw new Error('The steps did not show running, then done');

    walk.step('the agent fails to open: no Session, the Draft back, why said');
    await newSession(walk);
    await bubble.must('Agent', 'Opens slowly', { harness: 'claude', ms: 0 });
    await bubble.must('Agent', 'Opens fail', {
      harness: 'claude',
      reason: 'claude: spawn ENOMEM',
    });
    await bubble.close();
    await refused(walk, 'Open fails here', 'claude: spawn ENOMEM');
    await walk.shot('agent-fails-to-open');
    await bubble.must('Agent', 'Opens fail', { harness: 'claude', reason: '' });
    await clear(walk);

    walk.step(
      'an agent account removed from another device: the start refused',
    );
    await bubble.must(DISK, 'Add folder', { folder: '~/.claude-work' });
    await bubble.must('Agent', 'Sign in', {
      harness: 'claude',
      configFolder: '~/.claude-work',
    });
    await bubble.close();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Connections' }).click();
    const claude = walk.main
      .getByRole('region', { name: 'Connections' })
      .locator('ul > li')
      .first()
      .getByRole('region', { name: 'Claude' });
    await walk.button('Add Claude account', claude).click();
    await claude.getByRole('textbox', { name: 'Name' }).fill('Work');
    await claude
      .getByRole('textbox', { name: 'Config folder' })
      .fill('~/.claude-work');
    await walk.button('Add account', claude).click();
    await walk.button('Work', claude).waitFor();
    await newSession(walk);
    await walk.button(/Opus 5\.5/).click();
    const model = page.getByRole('dialog', { name: 'Model' });
    await model.getByRole('option').filter({ hasText: 'Work' }).click();
    await page.keyboard.press('Control+Enter');
    await model.waitFor({ state: 'detached' });
    await walk.see('Work ·', walk.main);
    await bubble.must(COMPUTER, 'Remove agent account elsewhere', {
      name: 'Work',
    });
    for (let tries = 0; ; tries += 1) {
      const said = await bubble.value(COMPUTER, ['saidElsewhere']);
      if (said === 'Removed agent account Work') break;
      if (tries > 40) throw new Error(`Another device said ${String(said)}`);
      await page.waitForTimeout(250);
    }
    await bubble.close();
    await refused(
      walk,
      'Work on the old account',
      'That agent account is no longer on this Connection',
    );
    await walk.shot('account-gone');
    // Asked again, the Connection's agents no longer hold Work: the Draft
    // falls back to the default.
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Connections' }).click();
    await walk.button('Reload').click();
    await walk.button('Work', claude).waitFor({ state: 'detached' });
    await newSession(walk);
    await walk.gone('Work ·', walk.main);
    await clear(walk);

    walk.step(
      'New Worktree, its branch pushed before its Title: it keeps its id name',
    );
    await bubble.must('Agent', 'Title next', { title: 'Push the fix early' });
    await bubble.must('Agent', 'Title slowly', { ms: 8000 });
    await bubble.close();
    await page.getByRole('switch', { name: 'New worktree' }).click();
    await send(page, 'Push it before the title');
    await walk.see('echo: Push it before the title');
    await page.waitForURL(/\/s\//);
    // Its branch as the sidebar says it, without `ke-code/`: the bubble's
    // tree lists 100 entries a level, fewer than this disk holds by now.
    const first = sidebar.getByRole('link', {
      name: /^Push it before the title Worktree /,
    });
    const id = /Worktree ([^\s"]+)/.exec(await first.ariaSnapshot())?.[1];
    if (id === undefined) throw new Error('No Worktree branch in the sidebar');
    console.log(`  made ke-code/${id}, pushed`);
    await bubble.must(DISK, 'Push branch', {
      project: '~/code/shop',
      branch: `ke-code/${id}`,
    });
    await bubble.close();
    await sidebar
      .getByRole('link', { name: `Push the fix early Worktree ${id}` })
      .waitFor({ timeout: 20_000 });
    await newSession(walk);
    const local = await branchRows(walk);
    console.log(`  branches: ${local.rows.join(', ')}`);
    if (
      !local.rows.includes(`ke-code/${id}`) ||
      local.rows.includes('ke-code/push-the-fix-early')
    )
      throw new Error(`Renamed though pushed: ${local.rows.join(', ')}`);
    await page.keyboard.press('Escape');
    await local.picker.waitFor({ state: 'detached' });
    await walk.shot('pushed-keeps-id');

    walk.step(
      "the start's answer lost as the tunnel moves: the app moves once the Session shows",
    );
    await newSession(walk);
    await bubble.must('Agent', 'Opens slowly', { harness: 'claude', ms: 4000 });
    await bubble.close();
    const lost = page.url();
    await send(page, 'Lost on the way');
    await walk.see(/Starting the agent/, walk.main);
    await bubble.must(COMPUTER, 'Move tunnel');
    await bubble.close();
    await page.waitForURL((url) => url.href !== lost, { timeout: 30_000 });
    await walk.see('echo: Lost on the way');
    await walk.shot('answer-lost-moved');

    walk.step('a restart mid-start: never there, the Draft says why');
    await newSession(walk);
    await send(page, 'Cut off on the way');
    await walk.see(/Starting the agent/, walk.main);
    await bubble.must(COMPUTER, 'Restart');
    await bubble.close();
    // It waits up to 15 s for the Session to show, once the link is back.
    await walk.says(walk.main, /The Connection could not be reached/, 45_000);
    if (!(await draftOf(walk).innerText()).includes('Cut off on the way'))
      throw new Error('The Draft lost its text');
    await walk.shot('answer-lost-never-there');
    await bubble.must('Agent', 'Opens slowly', { harness: 'claude', ms: 0 });
    await clear(walk);
  },
};
