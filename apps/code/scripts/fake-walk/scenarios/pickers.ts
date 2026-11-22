import type { CDPSession, Locator, Page } from 'playwright-core';
import type { Walk } from '../walker.ts';
import type { Scenario } from './index.ts';
import { replyWith, send } from './sessions.ts';
import { addComputer } from './tunnels.ts';

/*
 * The Pickers and the keys, over Studio and a second computer, Loft. The
 * Session Switcher lists every Session, the unsettled by activity and the
 * Settled last and quieter, each with its Project and Connection, the one
 * open checked. Actions, centred by its keys and beside the header's
 * button by a mouse: the Session's own rows (Settle, Fork, Go to the
 * original, Regenerate the title, Session details, Stop the turn while one
 * runs), then every key Action with its keys in either Mode, the one
 * chosen run once the Picker has closed; a Fork refused said in the
 * Picker, which stays. In Vim Mode, its status line, and the keys: the
 * sidebar and the page, the sessions before and after, Back and Forward, a
 * new session, the sidebar shown and hidden, Settings, the theme, the
 * microphone, a Dictation, `r` for what the session runs, each "even while
 * typing" from the Composer; the sidebar's cursor and the page's scroll.
 * On touch, a Drawer, a tall Drawer and a Sheet, closed by a swipe down or
 * a tap on what they dim.
 */

export const LOFT = 'Loft';

/** Polls until `check` holds, failing with `what` and what was last seen. */
export const until = async <A>(
  walk: Walk,
  what: string,
  read: () => Promise<A>,
  check: (now: A) => boolean,
  timeout = 8_000,
) => {
  const start = Date.now();
  for (;;) {
    const now = await read();
    if (check(now)) return now;
    if (Date.now() - start > timeout)
      throw new Error(`${what}: still ${JSON.stringify(now)}`);
    await walk.page.waitForTimeout(150);
  }
};

/** The Surfaces the keyboard is in, with the Mode of each: `content:insert`. */
const surfaces = (walk: Walk) =>
  walk.page.evaluate(() =>
    [...document.querySelectorAll('[data-surface][data-state="active"]')]
      .map(
        (each) =>
          `${each.getAttribute('data-surface')}${each.hasAttribute('data-mode') ? `:${each.getAttribute('data-mode')}` : ''}`,
      )
      .join(' '),
  );

/**
 * Presses a key and waits until the keyboard is in the Surface named. A
 * page just opened may not hear `i` yet: it is pressed again, once.
 */
const into = async (walk: Walk, key: string, surface: RegExp) => {
  await walk.page.keyboard.press(key);
  const heard = await until(
    walk,
    key,
    () => surfaces(walk),
    (now) => surface.test(now),
    1_500,
  ).then(
    () => true,
    () => false,
  );
  if (heard) return;
  if (key === 'i') await walk.page.keyboard.press(key);
  await until(
    walk,
    `${key} → ${surface}`,
    () => surfaces(walk),
    (now) => surface.test(now),
  );
};

/** The app's path now. */
const path = (walk: Walk) => new URL(walk.page.url()).pathname;

/** Presses a key and waits until the app is at another path; that path. */
const goes = async (walk: Walk, key: string, from = path(walk)) => {
  await walk.page.keyboard.press(key);
  return until(
    walk,
    `${key} goes from ${from}`,
    async () => path(walk),
    (now) => now !== from,
  );
};

/** Whether the sidebar is shown, as the shell says it. */
const sidebarIs = (walk: Walk, state: 'open' | 'closed') =>
  until(
    walk,
    `the sidebar ${state}`,
    () => walk.page.locator('aside').getAttribute('data-sidebar'),
    (now) => now === state,
  );

/** Whether Vim Mode is on: its Surfaces say a state only then. */
export const vimOn = async (walk: Walk) =>
  (await walk.page
    .locator('[data-surface="content"]')
    .first()
    .getAttribute('data-state')) !== 'off';

/** Turns Vim Mode on or off, as Mod+Alt+V does, unless it is already. */
export const vim = async (walk: Walk, on: boolean) => {
  if ((await vimOn(walk)) === on) return;
  await walk.page.keyboard.press('Control+Alt+v');
  await until(
    walk,
    `Vim Mode ${on}`,
    () => vimOn(walk),
    (now) => now === on,
  );
};

/** The Session open's row in the sidebar, by its title. */
export const row = (walk: Walk, title: string | RegExp) =>
  walk.page
    .getByRole('complementary')
    .locator('a[data-slot=sidebar-menu-button]')
    .filter({ hasText: title })
    .first();

/** The Actions Picker, opened by Ctrl+K. */
export const actions = async (walk: Walk) => {
  await walk.page.keyboard.press('Control+k');
  const picker = walk.page.getByRole('dialog', { name: 'Actions' });
  await picker.waitFor();
  return picker;
};

/** Runs one of the session's Actions by its row, the Picker closing. */
export const act = async (walk: Walk, name: RegExp) => {
  const picker = await actions(walk);
  await picker.getByRole('option', { name }).click();
  await picker.waitFor({ state: 'detached', timeout: 20_000 });
};

/** The scroll of the page's transcript: where it is, and how far it goes. */
const scrolled = (walk: Walk) =>
  walk.page.evaluate(() => {
    const scroller = [...document.querySelectorAll('main *')].find(
      (each) =>
        each.scrollHeight > each.clientHeight + 50 &&
        /auto|scroll/.test(getComputedStyle(each).overflowY),
    );
    return scroller === undefined
      ? { top: -1, end: -1 }
      : {
          top: Math.round(scroller.scrollTop),
          end: scroller.scrollHeight - scroller.clientHeight,
        };
  });

/**
 * The touch screen: the browser's emulation, through one CDP session for
 * the page, as an emulation another session set stays when it is gone.
 */
const devTools = new WeakMap<Page, CDPSession>();
export const touch = async (walk: Walk, on: boolean) => {
  const { page } = walk;
  const cdp = devTools.get(page) ?? (await page.context().newCDPSession(page));
  devTools.set(page, cdp);
  await cdp.send(
    'Emulation.setTouchEmulationEnabled',
    on ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
  );
  await page.setViewportSize(
    on ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  );
  // The device is read as the page loads.
  await page.reload();
  return cdp;
};

/** A finger's tap at the middle of a part of the page, or at a point. */
export const tap = async (
  cdp: CDPSession,
  at: Locator | { readonly x: number; readonly y: number },
) => {
  const box = 'x' in at ? null : await at.boundingBox();
  const { x, y } =
    box === null
      ? (at as { x: number; y: number })
      : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
};

/** A finger drawn from a point by `dx`, `dy`, in a few moves. */
export const swipe = async (
  walk: Walk,
  cdp: CDPSession,
  from: { readonly x: number; readonly y: number },
  dx: number,
  dy: number,
) => {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [from],
  });
  for (let step = 1; step <= 14; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: from.x + (dx * step) / 14, y: from.y + (dy * step) / 14 },
      ],
    });
    await walk.page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
};

/** How many sessions the sidebar says are Settled. */
export const settledCount = async (walk: Walk) =>
  Number(
    /Settled\s+(\d+)/.exec(
      await walk.page.getByRole('complementary').innerText(),
    )?.[1] ?? -1,
  );

/** What the Picker's options say, each on one line. */
const options = (picker: Locator) =>
  picker.getByRole('option').evaluateAll((all) =>
    all.map((option) => ({
      text: (option as HTMLElement).innerText.replace(/\s*\n\s*/g, ' | '),
      checked: option.getAttribute('data-checked') === 'true',
      quiet: option.hasAttribute('data-quiet'),
    })),
  );

export const pickers: Scenario = {
  name: 'pickers',
  title: 'Session Switcher, Actions, the keys in either Mode, touch Pickers',
  needs: ['sessions'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const sidebar = page.getByRole('complementary');

    walk.step('Loft, a second computer, with a session on ~/code/site');
    const loft = await addComputer(walk, LOFT);
    walk.kept.set('loft', loft);
    await bubble.must(`${loft}/fileSystem`, 'Add sample project', {
      folder: '~/code/site',
    });
    await replyWith(walk, 'echo');
    await bubble.close();
    // With every Link up Code asks Connect Cloud nothing: a reload asks.
    await page.reload();
    await walk.button('Choose whose sessions to show').waitFor();
    const projects = page.getByRole('dialog', { name: 'Open a project' });
    await page.keyboard.press('Control+p');
    await projects.getByRole('option', { name: /^Loft/ }).click();
    await projects.getByRole('option', { name: /Open a folder/ }).click();
    await projects.getByRole('combobox').fill('~/code/site');
    // Loft, just started again by the reload, may still be linking.
    await projects
      .getByRole('option', { name: 'site', exact: true })
      .waitFor({ timeout: 60_000 });
    await page.keyboard.press('Control+Enter');
    await walk.see('~/code/site');
    await send(page, 'Hello Loft');
    await walk.see('echo: Hello Loft');
    const helloLoft = path(walk);
    walk.kept.set('hello-loft', helloLoft);

    walk.step('Actions by its keys: a list in the middle, the screen dimmed');
    let picker = await actions(walk);
    await walk.see('Out of Vim Mode', picker);
    const said = await picker.innerText();
    for (const each of [
      'This session',
      'Settle',
      'Fork from the latest turn',
      'Regenerate the title',
      'Session details',
      'Open a project',
      'Show or hide the sidebar',
    ])
      if (!said.includes(each)) throw new Error(`Actions lack ${each}`);
    const middle = (await picker.boundingBox())!;
    if (Math.abs(middle.x + middle.width / 2 - 720) > 40)
      throw new Error(`Actions by keys are not centred: ${middle.x}`);
    await walk.shot('actions-keys');
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });

    walk.step('Actions by a mouse: beside its button, each key Action named');
    const button = walk.button('Session actions');
    await button.click();
    picker = page.getByRole('dialog', { name: 'Actions' });
    await picker.waitFor();
    const at = (await button.boundingBox())!;
    const beside = (await picker.boundingBox())!;
    if (
      beside.y < at.y + at.height - 2 ||
      beside.y > at.y + at.height + 24 ||
      Math.abs(beside.x + beside.width - (at.x + at.width)) > 40
    )
      throw new Error(
        `Actions are not beside the button: ${JSON.stringify(beside)}`,
      );
    const named = await picker
      .getByText('Open a project', { exact: true })
      .boundingBox();
    if (named === null || named.width < 60)
      throw new Error(`"Open a project" has no room: ${JSON.stringify(named)}`);
    await walk.shot('actions-mouse');
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });

    walk.step('a key Action chosen in Actions runs once it has closed');
    picker = await actions(walk);
    await page.keyboard.type('ctrl b');
    await picker
      .getByRole('option', { name: /^Show or hide the sidebar/ })
      .waitFor();
    await page.keyboard.press('Enter');
    await sidebarIs(walk, 'closed');
    await walk.shot('sidebar-hidden-from-actions');
    picker = await actions(walk);
    await page.keyboard.type('hide the sidebar');
    await page.keyboard.press('Enter');
    await sidebarIs(walk, 'open');

    walk.step(
      'Settle from Actions; the Switcher lists it with the Settled, quieter',
    );
    const sayHello = new URL(walk.kept.get('session')!).pathname;
    await walk.go(sayHello);
    await walk.see('echo: Say hello');
    const settled = await settledCount(walk);
    await act(walk, /^Settle/);
    await until(
      walk,
      'one more Settled',
      () => settledCount(walk),
      (now) => now === settled + 1,
    );
    const switcher = page.getByRole('dialog', { name: 'Switch session' });
    await page.keyboard.press('Control+j');
    await switcher.waitFor();
    const listed = await until(
      walk,
      'the Switcher lists every session',
      () => options(switcher),
      // The Switcher reads the Session as synced, a moment after the sidebar.
      (now) =>
        now.length >= 3 && now.some(({ checked, quiet }) => checked && quiet),
    );
    console.log(
      `  switcher: ${listed.map(({ text, checked, quiet }) => `${text}${checked ? ' [open]' : ''}${quiet ? ' [quiet]' : ''}`).join(' / ')}`,
    );
    const [first] = listed;
    if (first?.text !== 'Hello Loft | site · Loft')
      throw new Error(`The most recently active is not first: ${first?.text}`);
    // The most recently Settled first among the Settled, after every other.
    const openAt = listed.findIndex(({ checked }) => checked);
    const open = listed[openAt];
    if (
      open === undefined ||
      !open.text.startsWith('Say hello | shop · Studio') ||
      listed.filter(({ checked }) => checked).length !== 1
    )
      throw new Error(`The open session is not the one checked: ${open?.text}`);
    if (
      listed.slice(0, openAt).some(({ quiet }) => quiet) ||
      listed.slice(openAt).some(({ quiet }) => !quiet)
    )
      throw new Error('The Settled are not after every other, quieter');
    if (!listed.every(({ text }) => / · (Studio|Loft)\b/.test(text)))
      throw new Error('A session is not named with its Connection');
    await walk.see('Settled', switcher);
    await walk.shot('switcher');
    await page.keyboard.press('Escape');
    await switcher.waitFor({ state: 'detached' });

    walk.step('Un-settle from Actions');
    picker = await actions(walk);
    await picker.getByRole('option', { name: /^Un-settle/ }).click();
    await picker.waitFor({ state: 'detached' });
    await until(
      walk,
      'Say hello back in the sidebar',
      () => settledCount(walk),
      (now) => now === settled,
    );
    await row(walk, 'Say hello').waitFor();

    walk.step('the Switcher opens the session picked');
    await page.keyboard.press('Control+j');
    await switcher.waitFor();
    await page.keyboard.type('Hello Loft');
    await switcher.getByRole('option', { name: /^Hello Loft/ }).waitFor();
    await page.keyboard.press('Enter');
    await switcher.waitFor({ state: 'detached' });
    await until(
      walk,
      'on Hello Loft',
      async () => path(walk),
      (now) => now === helloLoft,
    );

    walk.step(
      'Fork refused while no Turn has finished: said, the Picker stays',
    );
    await replyWith(walk, 'long');
    await bubble.close();
    await page.keyboard.press('Control+n');
    await page
      .getByRole('textbox', { name: 'First message' })
      .filter({ visible: true })
      .waitFor();
    await send(page, 'Write it all out');
    await walk.see('Part 1.');
    picker = await actions(walk);
    await picker.getByRole('option', { name: /^Stop the turn/ }).waitFor();
    await picker.getByRole('option', { name: /^Fork from the latest/ }).click();
    const refused = picker.getByRole('alert');
    await refused.waitFor({ timeout: 20_000 });
    const why = (await refused.innerText()).trim();
    if (why !== 'It cannot be forked there: No Turn has finished yet')
      throw new Error(`The Fork was refused with "${why}"`);
    const shown = (await refused.boundingBox())!;
    if (shown.y < 0 || shown.y + shown.height > 900)
      throw new Error(`The refusal is out of sight: ${JSON.stringify(shown)}`);
    await walk.shot('fork-refused');

    walk.step('Stop the turn from Actions');
    await picker.getByRole('option', { name: /^Stop the turn/ }).click();
    await picker.waitFor({ state: 'detached' });
    await walk.button(/^Stopped by you/).waitFor();
    const long = path(walk);
    // A Turn stopped leaves no Fork Point: one more that ends does.
    await replyWith(walk, 'echo');
    await bubble.close();
    await send(page, 'Go on');
    await walk.see('echo: Go on');

    walk.step(
      'Regenerate the title, Fork, Go to the original, Session details',
    );
    await bubble.must('Agent', 'Title next', { title: 'Everything written' });
    await bubble.close();
    await act(walk, /^Regenerate the title/);
    await walk.see('Everything written', page.locator('header').first());
    await act(walk, /^Fork from the latest/);
    const fork = await until(
      walk,
      'on the Fork',
      async () => path(walk),
      (now) => now !== long,
    );
    picker = await actions(walk);
    await walk.see('Forked from Everything written', picker);
    await walk.shot('fork-actions');
    await picker.getByRole('option', { name: /^Go to the original/ }).click();
    await until(
      walk,
      'back on the original',
      async () => path(walk),
      (now) => now === long,
    );
    await act(walk, /^Session details/);
    const details = page.getByRole('dialog').filter({ hasText: 'Context' });
    await details.waitFor();
    await walk.shot('session-details');
    await page.keyboard.press('Escape');
    await details.waitFor({ state: 'detached' });

    walk.step('Vim Mode: its status line at the foot');
    await walk.go(fork);
    await walk.see('Forked from');
    await vim(walk, true);
    await page.keyboard.press('Escape');
    await walk.see(/^NORMAL$/);
    await walk.shot('vim-status-line');

    walk.step('`a`, `?` and Ctrl+? open Actions');
    for (const key of ['a', '?', 'Control+?']) {
      await page.keyboard.press(key);
      picker = page.getByRole('dialog', { name: 'Actions' });
      await picker.waitFor();
      await page.keyboard.press('Escape');
      await picker.waitFor({ state: 'detached' });
    }

    walk.step('`r` and Actions open what the session runs now');
    await vim(walk, false);
    await replyWith(walk, 'background jobs');
    await bubble.close();
    await send(page, 'Start the dev server');
    await walk.see('The dev server runs in the background');
    await page
      .getByRole('button', { name: /About this turn/ })
      .last()
      .waitFor({ timeout: 20_000 });
    await vim(walk, true);
    await page.keyboard.press('Escape');
    const running = page.getByRole('dialog', { name: 'Running now' });
    await page.keyboard.press('r');
    await running.getByRole('option', { name: /^pnpm dev/ }).waitFor();
    await walk.shot('running-by-r');
    await page.keyboard.press('Escape');
    await running.waitFor({ state: 'detached' });
    await page.keyboard.press('a');
    picker = page.getByRole('dialog', { name: 'Actions' });
    await picker.waitFor();
    await page.keyboard.type('runs now');
    await picker
      .getByRole('option', { name: /^What the session runs now/ })
      .waitFor();
    await page.keyboard.press('Enter');
    await running.waitFor();
    await page.keyboard.press('Escape');
    await running.waitFor({ state: 'detached' });
    // Both jobs end, the latest first, as a blank job names it.
    for (let ended = 0; ended < 2; ended += 1)
      await bubble.must('Agent', 'End job', {
        job: '',
        how: 'done',
        summary: 'Done',
      });
    await replyWith(walk, 'echo');
    await bubble.close();

    walk.step('Vim keys anywhere: h and l, [ and ], Back, Forward, n');
    await page.keyboard.press('Escape');
    await into(walk, 'h', /^sidebar:normal$/);
    await into(walk, 'l', /^content:normal$/);
    const before = path(walk);
    const previous = await goes(walk, '[');
    await goes(walk, ']', previous);
    if (path(walk) !== before) throw new Error('`]` did not come back');
    await goes(walk, 'Control+o');
    await goes(walk, 'Control+i');
    if (path(walk) !== before) throw new Error('Ctrl+I did not go forward');
    await goes(walk, 'n');
    await page
      .getByRole('textbox', { name: 'First message' })
      .filter({ visible: true })
      .waitFor();
    await goes(walk, 'Control+o');
    if (path(walk) !== before) throw new Error('Back did not come back');

    walk.step(
      'b, t, Ctrl+, and d: the sidebar, the theme, Settings, the microphone',
    );
    await page.keyboard.press('b');
    await sidebarIs(walk, 'closed');
    await page.keyboard.press('b');
    await sidebarIs(walk, 'open');
    const dark = () =>
      page.evaluate(() => document.documentElement.classList.contains('dark'));
    const theme = await dark();
    await page.keyboard.press('t');
    await until(walk, 'the theme switched', dark, (now) => now !== theme);
    await walk.shot('theme-switched');
    await page.keyboard.press('t');
    await until(walk, 'the theme back', dark, (now) => now === theme);
    await goes(walk, 'Control+,');
    if (!path(walk).endsWith('/settings')) throw new Error('Not in Settings');
    await goes(walk, 'Control+,');
    if (path(walk) !== before) throw new Error('Ctrl+, did not come back');
    await page.keyboard.press('d');
    const microphones = page
      .getByRole('dialog')
      .filter({ hasText: 'Choose the microphone' });
    await microphones.waitFor();
    await walk.shot('microphone-picker');
    await page.keyboard.press('Escape');
    await microphones.waitFor({ state: 'detached' });

    walk.step('Space starts a Dictation and stops it');
    await bubble.must('Microphone', 'Allow microphone');
    await bubble.close();
    const draft = walk.main.locator('text=/^(RECORDING|DRAFT|MESSAGE)$/i');
    const recording = () => walk.main.getByText(/^RECORDING$/i).count();
    await page.keyboard.press('Space');
    await until(walk, 'recording', recording, (now) => now > 0);
    await walk.shot('dictating');
    await page.keyboard.press('Space');
    await until(walk, 'no longer recording', recording, (now) => now === 0);
    await draft.first().waitFor();

    walk.step(
      'even while typing: Ctrl+H, Ctrl+L, Ctrl+[ and ], Ctrl+B, Ctrl+N, Ctrl+O, Ctrl+,',
    );
    await into(walk, 'i', /^content:insert$/);
    // What the Dictation put in the Draft goes, so no later send carries it.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await into(walk, 'Control+h', /^sidebar:normal$/);
    await into(walk, 'Control+l', /^content:insert$/);
    const elsewhere = await goes(walk, 'Control+[');
    await into(walk, 'i', /^content:insert$/);
    await goes(walk, 'Control+]', elsewhere);
    await into(walk, 'i', /^content:insert$/);
    await page.keyboard.press('Control+b');
    await sidebarIs(walk, 'closed');
    await page.keyboard.press('Control+b');
    await sidebarIs(walk, 'open');
    await goes(walk, 'Control+n');
    await into(walk, 'i', /^content:insert$/);
    await goes(walk, 'Control+o');
    await into(walk, 'i', /^content:insert$/);
    await goes(walk, 'Control+,');
    await goes(walk, 'Control+,');
    if (path(walk) !== before) throw new Error('Not back from Settings');

    walk.step('Ctrl+Space dictates from the Composer, and again in a Picker');
    await into(walk, 'i', /^content:insert$/);
    await page.keyboard.press('Control+Space');
    await until(walk, 'recording', recording, (now) => now > 0);
    await page.keyboard.press('Control+j');
    await switcher.waitFor();
    await page.keyboard.press('Control+Space');
    await until(walk, 'no longer recording', recording, (now) => now === 0);
    await page.keyboard.press('Escape');
    await switcher.waitFor({ state: 'detached' });
    await into(walk, 'i', /^content:insert$/);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');

    walk.step("the sidebar's keys: j, k, g g, Shift+G, Enter; Escape back");
    // Where the cursor is, by its place, and what it says first.
    const cursor = () =>
      page
        .locator('aside [data-cursor]')
        .evaluateAll((all) =>
          all.map(
            (each) =>
              `${each.getAttribute('data-place') ?? ''} ${(each as HTMLElement).innerText.split('\n')[0]}`,
          ),
        )
        .then((all) => all.join(''));
    await into(walk, 'h', /^sidebar:normal$/);
    const start = await cursor();
    await page.keyboard.press('j');
    const below = await until(walk, 'j moves', cursor, (now) => now !== start);
    await page.keyboard.press('k');
    await until(walk, 'k moves back', cursor, (now) => now === start);
    await page.keyboard.press('g');
    await page.keyboard.press('g');
    await until(walk, 'g g: the first row, a Connection', cursor, (now) =>
      / (LOFT|STUDIO)\b/.test(now),
    );
    await page.keyboard.press('Shift+G');
    await until(walk, 'Shift+G: the last row', cursor, (now) =>
      now.endsWith(' Settled'),
    );
    await walk.shot('sidebar-cursor');
    await page.keyboard.press('k');
    const opened = await until(
      walk,
      'k: a session',
      cursor,
      (now) => !now.endsWith(' Settled'),
    );
    await page.keyboard.press('Enter');
    await until(
      walk,
      'Enter opens it, on the page',
      () => surfaces(walk),
      (now) => now.startsWith('content'),
    );
    await walk.see(
      opened.slice(opened.indexOf(' ') + 1),
      page.locator('header').first(),
    );
    await into(walk, 'h', /^sidebar:normal$/);
    await into(walk, 'Escape', /^content:normal$/);
    console.log(`  cursor: ${start} → ${below} …`);

    walk.step(
      "the page's keys on a long session: g g, j, Ctrl+D, Ctrl+U, Page Down and Up, Shift+G, k",
    );
    await page.keyboard.press('s');
    await switcher.waitFor();
    await page.keyboard.press('Escape');
    await switcher.waitFor({ state: 'detached' });
    await walk.go(sayHello);
    await until(
      walk,
      'a long session drawn',
      () => scrolled(walk),
      (now) => now.end > 1_500,
      15_000,
    );
    await page.keyboard.press('Escape');
    const steps: Array<string> = [];
    const scroll = async (
      key: string,
      moves: (was: number, now: number) => boolean,
    ) => {
      const was = (await scrolled(walk)).top;
      await page.keyboard.press(key);
      const now = await until(
        walk,
        `${key} scrolls`,
        () => scrolled(walk),
        (it) => moves(was, it.top),
      );
      steps.push(`${key} ${now.top}`);
      return now;
    };
    await page.keyboard.press('g');
    await scroll('g', (_, now) => now === 0);
    await scroll('j', (was, now) => now > was);
    await scroll('Control+d', (was, now) => now > was + 100);
    await scroll('Control+u', (was, now) => now < was - 100);
    await scroll('PageDown', (was, now) => now > was + 200);
    await scroll('PageUp', (was, now) => now < was - 200);
    const bottom = await scroll('Shift+G', (was, now) => now > was);
    if (Math.abs(bottom.top - bottom.end) > 4)
      throw new Error(
        `Shift+G is not at the bottom: ${JSON.stringify(bottom)}`,
      );
    await scroll('k', (was, now) => now < was);
    console.log(`  scroll: ${steps.join(', ')}`);
    await vim(walk, false);
    // Kept in Preferences a moment later: before the reload that comes.
    await page.waitForTimeout(1_500);

    walk.step("on touch: Actions in a Drawer, the session's own alone");
    const cdp = await touch(walk, true);
    await walk.go(helloLoft);
    await walk.see('echo: Hello Loft');
    const touchButton = page
      .getByRole('button', { name: 'Session actions' })
      .filter({ visible: true })
      .first();
    await tap(cdp, touchButton);
    picker = page.getByRole('dialog', { name: 'Actions' });
    await picker.waitFor();
    await page.waitForTimeout(500);
    const onTouch = await picker.innerText();
    if (onTouch.includes('Open a project') || !onTouch.includes('Settle'))
      throw new Error(`Actions on touch list: ${onTouch}`);
    await walk.shot('touch-actions-drawer');
    const drawn = (await picker.boundingBox())!;
    await swipe(walk, cdp, { x: 195, y: drawn.y + 20 }, 0, 330);
    await picker.waitFor({ state: 'detached' });

    walk.step('tapping what it dims closes it');
    await tap(cdp, touchButton);
    await picker.waitFor();
    await page.waitForTimeout(500);
    await tap(cdp, { x: 195, y: 120 });
    await picker.waitFor({ state: 'detached' });

    walk.step(
      'the Project Picker in a tall Drawer, the Branch Picker in a Sheet',
    );
    await tap(
      cdp,
      page
        .getByRole('button', { name: 'Back' })
        .filter({ visible: true })
        .first(),
    );
    // Once the sidebar has slid in.
    await page.waitForTimeout(800);
    await tap(
      cdp,
      page
        .getByRole('button', { name: 'Open a project' })
        .filter({ visible: true })
        .first(),
    );
    await projects.waitFor();
    // Two Connections: the Connection Step first, once the Drawer is up.
    await page.waitForTimeout(800);
    await tap(cdp, projects.getByRole('option', { name: /^Studio/ }));
    await walk.see('Recent projects', projects);
    await page.waitForTimeout(500);
    const tall = (await projects.boundingBox())!;
    if (tall.height < 500)
      throw new Error(`The Project Picker is not tall: ${tall.height}`);
    await walk.shot('touch-projects-drawer');
    await tap(cdp, projects.getByRole('option', { name: /^shop/ }));
    await projects.waitFor({ state: 'detached' });
    await walk.see('~/code/shop');
    const branch = page
      .getByRole('button', { name: /^Branch: / })
      .filter({ visible: true })
      .first();
    await branch.waitFor();
    await page.waitForTimeout(500);
    await tap(cdp, branch);
    const branches = page.getByRole('dialog', { name: 'Branch' });
    await branches.waitFor();
    // A Sheet: it has a search.
    await branches.locator('input').waitFor();
    await page.waitForTimeout(500);
    await walk.shot('touch-branch-sheet');
    await tap(cdp, { x: 195, y: 60 });
    await branches.waitFor({ state: 'detached' });

    walk.step('back to a wide screen with a mouse');
    await touch(walk, false);
    await walk.button('Choose whose sessions to show').waitFor();
    await vim(walk, false);
  },
};
