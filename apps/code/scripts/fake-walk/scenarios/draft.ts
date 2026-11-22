import type { Locator, Page } from 'playwright-core';
import type { Walk } from '../walker.ts';
import { COMPUTER } from './home.ts';
import type { Scenario } from './index.ts';
import { row, until, vim } from './pickers.ts';
import { DISK } from './projects.ts';
import { replyWith } from './sessions.ts';

/*
 * The Draft on shop, over Studio and the Agent fake. In a running session:
 * a message sent while a Turn runs steers it; Vim Mode keeps the Draft
 * read-only until `i`, Escape leaves it, `/` puts a Skill in and `u` takes
 * it out, `m`, `p` and `e` open the model Picker where each is; by mouse
 * the started session's Picker has no agent Step, and a model and settings
 * changed hold from the next Turn, as the Agent fake's Model shows. The
 * Saved Draft: text, selection, Btw mode and a file back after leaving and
 * after a reload; a chip removed; files over their limits left out, said;
 * a send whose file the Connection cannot save comes back. On a new
 * session's page: a second Claude login, its models and Skills failing
 * first, then Try again; the Default Account not named; a refused model
 * list keeping what showed; signed out, the models.dev list; an agent not
 * installed, unpickable, and none installed, said with a way to Settings;
 * a Skill for shop alone; the new session's Saved Draft gone once it
 * starts; and a session of the added login once the login is removed.
 */

/** The Draft's text box showing, as the page names it now. */
const box = (page: Page, name: RegExp = /^(First message|Message)$/) =>
  page.getByRole('textbox', { name }).filter({ visible: true }).first();

/** Types into a text box and sends it, as Ctrl+Enter does. */
const sendIn = async (page: Page, into: Locator, text: string) => {
  await into.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
};

/** Empties the Draft's text box showing. */
const empty = async (page: Page, into: Locator) => {
  await into.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
};

/** How many Turns have ended in the session open. */
const ended = (page: Page) =>
  page.getByRole('button', { name: /About this turn/ }).count();

/** Picks a file in the browser's file chooser, from the paperclip. */
const attach = async (
  walk: Walk,
  files: Parameters<import('playwright-core').FileChooser['setFiles']>[0],
) => {
  const [chooser] = await Promise.all([
    walk.page.waitForEvent('filechooser'),
    walk.button('Attach files').click(),
  ]);
  await chooser.setFiles(files);
};

/** The model Picker, opened from the Status Line. */
const modelPicker = async (walk: Walk) => {
  await walk.page.getByRole('button', { name: /^Model: / }).click();
  const picker = walk.page.getByRole('dialog', { name: 'Model' });
  await picker.waitFor();
  return picker;
};

/** The agent Step of a new session's model Picker, its account found by a search and chosen with Mod+Enter. */
const chooseAgent = async (walk: Walk, search: string) => {
  const picker = await modelPicker(walk);
  await picker.getByRole('combobox').fill(search);
  await walk.page.keyboard.press('Control+Enter');
  await picker.waitFor({ state: 'detached' });
};

/** The Status Line's model button, as it reads. */
const modelShown = (walk: Walk) =>
  walk.page.getByRole('button', { name: /^Model: / }).innerText();

/** Shop's new session page, by its sidebar link: in the app, so the page asks its Skills anew. */
const newSession = async (walk: Walk) => {
  await walk.page
    .getByRole('complementary')
    .getByRole('link', { name: /^shop .*New session$/ })
    .click();
  await box(walk.page, /^First message$/).waitFor();
};

/** Settings → Connections, Studio's Claude. */
const claudeCard = async (walk: Walk) => {
  const { page } = walk;
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  return walk.main
    .getByRole('region', { name: 'Connections' })
    .locator('ul > li')
    .first()
    .getByRole('region', { name: 'Claude' });
};

/** Reloads the page and waits for the Draft: every computer restarts, the Setup is asked again. */
const reload = async (walk: Walk) => {
  await walk.page.reload();
  await box(walk.page, /^(First message|Message|By the way)$/).waitFor({
    timeout: 30_000,
  });
  await walk.page.waitForTimeout(1_500);
};

/** The agents open in the Agent fake, each as the bubble shows it. */
const agentsOpen = async (walk: Walk) => {
  const all: Array<string> = [];
  const count = Number(
    (await walk.bubble.model('Agent', ['agents'])).match(/\[(\d+)\]/)?.[1] ?? 0,
  );
  for (let at = 0; at < count; at++)
    all.push(
      [
        await walk.bubble.model('Agent', ['agents', String(at)]),
        await walk.bubble.model('Agent', ['agents', String(at), 'settings']),
      ].join(' '),
    );
  await walk.bubble.close();
  return all.map((each) => each.replace(/\s+/g, ' '));
};

export const draft: Scenario = {
  name: 'draft',
  title:
    'The Draft: steer, Vim, Saved Draft, files, a send refused, the model and Skills Pickers',
  needs: ['sessions'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const sayHello = walk.kept.get('session')!;
    await bubble.close();
    await walk.go(sayHello);
    await box(page, /^Message$/).waitFor({ timeout: 30_000 });
    await vim(walk, false);
    // Kept in Preferences a moment later: before the reloads that come.
    await page.waitForTimeout(1_500);

    walk.step('a message sent while a Turn runs steers it');
    await replyWith(walk, 'long');
    await bubble.close();
    const before = await ended(page);
    await sendIn(page, box(page, /^Message$/), 'Write it all out again');
    const steer = box(page, /^Steer the agent$/);
    await steer.waitFor();
    await walk.see(/Part 2\./);
    await sendIn(page, steer, 'Keep it short');
    await walk.see('Sent while it worked');
    await walk.see('Noted: Keep it short');
    await walk.shot('steered');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await until(
      walk,
      'the steered Turn ended',
      () => ended(page),
      (now) => now > before,
    );

    walk.step('Vim Mode: read-only until i; Escape leaves the Draft');
    await replyWith(walk, 'echo');
    await bubble.close();
    await vim(walk, true);
    const message = box(page, /^Message$/);
    await page.keyboard.press('Escape');
    if ((await message.getAttribute('contenteditable')) !== 'false')
      throw new Error('The Draft can be written before i');
    await page.keyboard.type('xyz');
    if ((await message.innerText()).trim() !== '')
      throw new Error('Keys went into the Draft before i');
    await walk.shot('vim-read-only');
    await page.keyboard.press('i');
    await until(
      walk,
      'i makes the Draft writable',
      () => message.getAttribute('contenteditable'),
      (now) => now === 'true',
    );
    await page.keyboard.type('Run ');
    await page.keyboard.press('Escape');
    await until(
      walk,
      'Escape leaves the Draft',
      () =>
        page.evaluate(
          () => document.activeElement?.getAttribute('aria-label') ?? '',
        ),
      (now) => now !== 'Message',
    );

    walk.step('/ puts a Skill in at the cursor, as one atom; u takes it out');
    await page.keyboard.press('/');
    const skills = page.getByRole('dialog', { name: 'Skills' });
    await skills.getByRole('option', { name: /^\/review/ }).waitFor();
    await walk.shot('skills-by-slash');
    await page.keyboard.press('Enter');
    await skills.waitFor({ state: 'detached' });
    await walk.says(message, /^Run \/review\s*$/);
    await walk.shot('skill-in');
    await page.keyboard.press('Escape');
    await page.keyboard.press('u');
    await walk.says(message, /^Run\s*$/);
    await walk.shot('undone');

    walk.step(
      'm, p and e open the model Picker at the model, permissions, effort',
    );
    const picked = page.getByRole('dialog', { name: /^(Model|Settings)$/ });
    for (const [key, at, row] of [
      ['m', /^Claude$/, /^Claude Opus 5\.5/],
      ['p', /Permissions$/, /^Bypass permissions/],
      ['e', /Effort$/, /^High/],
    ] as const) {
      await page.keyboard.press(key);
      await walk.says(picked.getByRole('navigation'), at);
      await picked.getByRole('option', { name: row }).waitFor();
      await walk.shot(`key-${key}`);
      await page.keyboard.press('Escape');
      await picked.waitFor({ state: 'detached' });
    }
    await page.keyboard.press('i');
    await empty(page, message);
    await page.keyboard.press('Escape');
    await vim(walk, false);
    await page.waitForTimeout(1_500);

    walk.step(
      'by mouse: a started session keeps its agent; model, effort, permissions',
    );
    let picker = await modelPicker(walk);
    await walk.says(picker.getByRole('navigation'), /^Claude$/);
    await picker.getByRole('option', { name: /^Claude Sonnet 5/ }).click();
    await walk.says(picker.getByRole('navigation'), /Effort$/);
    await picker.getByRole('option', { name: /^Low/ }).click();
    await walk.says(picker.getByRole('navigation'), /Permissions$/);
    await walk.shot('model-permissions');
    await picker.getByRole('option', { name: /^Accept edits/ }).click();
    await picker.waitFor({ state: 'detached' });
    await walk.button(/^Settings: Low · Accept edits/).waitFor();
    if (!/Sonnet 5/.test(await modelShown(walk)))
      throw new Error(`The model shows ${await modelShown(walk)}`);
    await walk.shot('model-changed');

    walk.step('changed mid-session, they hold from the next Turn');
    await sendIn(page, box(page, /^Message$/), 'Which model now?');
    await walk.see('echo: Which model now?');
    const agents = await agentsOpen(walk);
    console.log(`  agents: ${agents.join(' | ')}`);
    if (
      !agents.some(
        (each) =>
          each.includes('claude-sonnet-5') &&
          /low/.test(each) &&
          /acceptEdits/i.test(each),
      )
    )
      throw new Error('No Agent runs on Sonnet 5, low, accept edits');
    await bubble.open();
    await bubble.host
      .locator('span.k:text-is("agents:")')
      .first()
      .scrollIntoViewIfNeeded();
    await walk.shot('agent-on-sonnet', { bubble: true });

    walk.step(
      'Mod+Enter finishes the Picker at the model; back to High, Bypass',
    );
    picker = await modelPicker(walk);
    await picker.getByRole('combobox').fill('opus');
    await page.keyboard.press('Control+Enter');
    await picker.waitFor({ state: 'detached' });
    if (!/Opus 5\.5/.test(await modelShown(walk)))
      throw new Error(`The model shows ${await modelShown(walk)}`);
    await walk.button(/^Settings: Low · Accept edits/).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('option', { name: /^High/ }).click();
    await settings.getByRole('option', { name: /^Bypass permissions/ }).click();
    await settings.waitFor({ state: 'detached' });
    await walk.button(/^Settings: High · Bypass permissions/).waitFor();

    walk.step(
      'the Saved Draft: text, selection, Btw mode and a file, after leaving',
    );
    await message.click();
    await page.keyboard.type('Keep this draft');
    for (let at = 0; at < 5; at++) await page.keyboard.press('Shift+ArrowLeft');
    await attach(walk, {
      name: 'plan.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Plan\n'),
    });
    await walk.see('plan.md');
    await walk.button('By the way').click();
    const btw = box(page, /^By the way$/);
    await btw.waitFor();
    await page.keyboard.type('which file holds the store?');
    await walk.shot('draft-written');
    await row(walk, 'Are you there?').click();
    await box(page, /^Message$/).waitFor();
    await row(walk, 'Say hello').click();
    const back = async (where: string) => {
      await walk.says(btw, /^which file holds the store\?\s*$/);
      await walk.shot(`btw-${where}`);
      await walk.button('Back to the message').click();
      await walk.says(message, /^Keep this draft\s*$/);
      await message.focus();
      await until(
        walk,
        `the selection ${where}`,
        () => page.evaluate(() => getSelection()?.toString() ?? ''),
        (now) => now === 'draft',
      );
      await walk.see('plan.md');
      await walk.shot(`message-${where}`);
    };
    await back('back');

    walk.step('and after a reload');
    await walk.button('By the way').click();
    await btw.waitFor();
    // Saved a quarter of a second after a change.
    await page.waitForTimeout(800);
    await reload(walk);
    await back('reloaded');

    walk.step('a chip removed; the Btw text emptied');
    await walk.button('Remove plan.md').click();
    await walk.gone('plan.md');
    await walk.button('By the way').click();
    await empty(page, btw);
    await walk.button('Back to the message').click();

    walk.step('an image over 5 MB and a file over 50 MB are left out, said');
    const files = await import('node:fs');
    files.writeFileSync('/tmp/walk-huge.png', Buffer.alloc(6 * 1024 * 1024));
    files.writeFileSync('/tmp/walk-big.bin', Buffer.alloc(51 * 1024 * 1024));
    await attach(walk, ['/tmp/walk-huge.png', '/tmp/walk-big.bin']);
    await walk.see('walk-huge.png is too large. Images can be up to 5 MB.');
    await walk.see('walk-big.bin is too large. Files can be up to 50 MB.');
    await walk.shot('too-large');
    files.rmSync('/tmp/walk-big.bin');
    files.rmSync('/tmp/walk-huge.png');

    walk.step(
      "a send refused: Studio can't save the file; text and file come back",
    );
    const attachments = '/var/kestack/connect/attachments';
    await bubble.must(DISK, 'Add folder', { folder: attachments });
    await bubble.must(DISK, 'Make unreadable', { folder: attachments });
    await bubble.close();
    await empty(page, message);
    await attach(walk, {
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Remember the index.\n'),
    });
    await walk.see('notes.txt');
    await message.click();
    await page.keyboard.type('Read my notes once more');
    await page.keyboard.press('Control+Enter');
    await walk.see('The Connection could not take it');
    await walk.says(message, /^Read my notes once more\s*$/);
    await walk.see('notes.txt');
    await walk.shot('send-refused');
    await bubble.must(DISK, 'Make readable', { folder: attachments });
    await bubble.close();
    // The Connection's call died, and Effect RPC takes a defect as fatal to
    // the socket: every stream on it ended, so the transcript updates again
    // only once the page is opened anew.
    await reload(walk);
    await message.click();
    await page.keyboard.press('Control+Enter');
    await walk.see('echo: Read my notes once more');
    await walk.shot('sent-after');

    walk.step(
      'a second Claude login, Side: its models and Skills fail at first',
    );
    await bubble.must('Agent', 'Models fail', {
      harness: 'claude',
      reason: 'The models server said 503',
    });
    await bubble.must('Agent', 'Skills fail', {
      harness: 'claude',
      reason: 'The skills folder could not be read',
    });
    await bubble.must(DISK, 'Add folder', { folder: '~/.claude-side' });
    await bubble.must('Agent', 'Sign in', {
      harness: 'claude',
      configFolder: '~/.claude-side',
    });
    await bubble.close();
    let claude = await claudeCard(walk);
    await walk.button('Add Claude account', claude).click();
    await claude.getByRole('textbox', { name: 'Name' }).fill('Side');
    await claude
      .getByRole('textbox', { name: 'Config folder' })
      .fill('~/.claude-side');
    await walk.button('Add account', claude).click();
    await walk.button('Side', claude).waitFor();
    await newSession(walk);
    picker = await modelPicker(walk);
    for (const agent of [/^Claude Default/, /^Claude Side/, /^Codex Default/])
      await picker.getByRole('option', { name: agent }).waitFor();
    await walk.shot('agents');
    await page.keyboard.press('Escape');
    await chooseAgent(walk, 'side');
    const alert = walk.main.getByRole('region', { name: 'New session' });
    await walk.says(alert, /Could not load the models\s*Try again/);
    await walk.shot('side-models-fail');
    await walk.button('Add a skill').click();
    await walk.see(
      "Couldn't load skills: The skills folder could not be read",
      page.getByRole('dialog', { name: 'Skills' }),
    );
    await walk.shot('side-skills-fail');
    await page.keyboard.press('Escape');

    walk.step('both work again: Try again; Side named beside the logo');
    await bubble.must('Agent', 'Models fail', {
      harness: 'claude',
      reason: '',
    });
    await bubble.must('Agent', 'Skills fail', {
      harness: 'claude',
      reason: '',
    });
    await bubble.must('Agent', 'Add skill', {
      harness: 'claude',
      folder: '~/code/shop',
      name: 'deploy',
      description: 'Ship shop to production',
    });
    await bubble.close();
    await walk.button('Try again').click();
    await walk.gone('Could not load the models');
    await until(
      walk,
      'Side · Opus 5.5',
      () => modelShown(walk),
      (now) => /^Side\s*·\s*Opus 5\.5$/.test(now.trim()),
    );
    await walk.shot('side-chosen');
    await walk.button('Add a skill').click();
    const listed = page.getByRole('dialog', { name: 'Skills' });
    await listed.getByRole('option', { name: /^\/deploy/ }).click();
    await walk.says(box(page, /^First message$/), /\/deploy/);
    await walk.shot('skill-for-shop');
    await empty(page, box(page, /^First message$/));

    walk.step('the Default Account is not named');
    await chooseAgent(walk, 'default');
    await until(
      walk,
      'Opus 5.5 alone',
      () => modelShown(walk),
      (now) => now.trim() === 'Opus 5.5',
    );

    walk.step('the models refused once more: what showed stays');
    await bubble.must('Agent', 'Models fail', {
      harness: 'claude',
      reason: 'The models server said 503',
    });
    await bubble.close();
    await reload(walk);
    picker = await modelPicker(walk);
    await picker.getByRole('option', { name: /^Claude Default/ }).click();
    await picker.getByRole('option', { name: /^Claude Haiku 5\.5/ }).waitFor();
    await walk.shot('models-kept');
    await page.keyboard.press('Escape');
    await bubble.must('Agent', 'Models fail', {
      harness: 'claude',
      reason: '',
    });

    walk.step('Claude signed out: the models.dev list it accepts');
    await bubble.must('Agent', 'Sign out', {
      harness: 'claude',
      configFolder: '',
    });
    await bubble.close();
    await reload(walk);
    picker = await modelPicker(walk);
    await picker.getByRole('option', { name: /^Claude Default/ }).click();
    await picker.getByRole('option', { name: /^Claude Opus 4\.5/ }).waitFor();
    await walk.shot('models-dev');
    await page.keyboard.press('Escape');
    await bubble.must('Agent', 'Sign in', {
      harness: 'claude',
      configFolder: '',
    });

    walk.step('Codex not installed: shown, unpickable, with why');
    await bubble.must('Agent', 'Uninstall', {
      harness: 'codex',
      why: 'Not on this Mac',
    });
    await bubble.close();
    await reload(walk);
    picker = await modelPicker(walk);
    const codex = picker.getByRole('option', { name: /^Codex Default/ });
    await walk.says(codex, /Not on this Mac/);
    if ((await codex.getAttribute('aria-disabled')) !== 'true')
      throw new Error('Codex can be picked');
    await walk.shot('codex-not-installed');
    await page.keyboard.press('Escape');

    walk.step('neither installed: the Draft says why, with a way to Settings');
    await bubble.must('Agent', 'Uninstall', {
      harness: 'claude',
      why: 'Removed by hand',
    });
    await bubble.close();
    await reload(walk);
    await walk.says(alert, /Removed by hand\s*Open Settings/);
    await walk.shot('none-installed');
    await page.getByRole('link', { name: 'Open Settings' }).click();
    await page
      .getByRole('tab', { name: 'Connections', selected: true })
      .waitFor();
    await bubble.must('Agent', 'Install', { harness: 'claude', version: '' });
    await bubble.must('Agent', 'Install', { harness: 'codex', version: '' });
    await bubble.close();
    await newSession(walk);
    await reload(walk);

    walk.step("a new session's Saved Draft, gone once it starts");
    await chooseAgent(walk, 'side');
    const first = box(page, /^First message$/);
    await first.click();
    await page.keyboard.type('As Side');
    await page.waitForTimeout(800);
    await row(walk, 'Say hello').click();
    await box(page, /^Message$/).waitFor();
    await newSession(walk);
    await walk.says(first, /^As Side\s*$/);
    if (!(await modelShown(walk)).trim().startsWith('Side'))
      throw new Error(`The pick was not kept: ${await modelShown(walk)}`);
    await walk.shot('new-draft-back');
    await first.click();
    await page.keyboard.press('Control+Enter');
    await walk.see('echo: As Side');
    walk.kept.set('side', page.url());
    await newSession(walk);
    await walk.says(first, /^\s*$/);
    await walk.shot('new-draft-gone');

    walk.step(
      'Side removed: its session carries on while its agent is open, then fails',
    );
    claude = await claudeCard(walk);
    await walk.button('Side', claude).click();
    await walk.button('Remove…', claude).click();
    await walk
      .button('Remove', claude.getByRole('group', { name: 'Remove Side?' }))
      .click();
    await walk.button('Side', claude).waitFor({ state: 'detached' });
    await row(walk, 'As Side').click();
    await sendIn(page, box(page, /^Message$/), 'Still there?');
    await walk.see('echo: Still there?');
    await bubble.must(COMPUTER, 'Restart');
    await bubble.close();
    await page.waitForTimeout(5_000);
    await sendIn(page, box(page, /^Message$/), 'And now?');
    await walk.see('Its Harness Account was removed from this Connection');
    await walk.shot('side-removed');
  },
};
