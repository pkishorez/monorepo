import type { Locator } from 'playwright-core';
import type { Walk } from '../walker.ts';
import { COMPUTER } from './home.ts';
import type { Scenario } from './index.ts';
import { replyWith, send } from './sessions.ts';

/*
 * Kabuki's DevTools over Code in fake mode, as in real dev mode: the dock's
 * Inspector reads Code's own Runtime, never a Fake's. Its Timeline lists
 * Code's Steps as the app is used; a past Step Seeked draws Code as it was,
 * Go to Head draws it as it is; Fork moves Code's Head back, and the next
 * Message grows a new Branch. Seek rewinds Code only: the Fakes and the
 * middle in the tab keep their state and go on, as a real server does, so
 * a reply streams on while Code shows the past, and after a Fork the
 * middle still has the session Code forgot.
 */

/** The dock's Inspector, opened from its button, unless open already. */
const openDock = async (walk: Walk) => {
  const { page } = walk;
  const dock = page.getByRole('dialog', { name: 'Devtools' });
  const open = page.getByRole('button', { name: 'Open Devtools' });
  if ((await open.count()) > 0) await open.click();
  await dock.getByRole('slider', { name: 'Steps' }).waitFor();
  return dock;
};

const closeDock = async (walk: Walk) => {
  const close = walk.page.getByRole('button', { name: 'Close Devtools' });
  if ((await close.count()) > 0) await close.click();
};

/** Where the Timeline stands: its Step's number, of how many, and its label. */
const where = async (dock: Locator) => {
  const steps = dock.getByRole('slider', { name: 'Steps' });
  return {
    at: Number(await steps.getAttribute('aria-valuenow')),
    of: Number(await steps.getAttribute('aria-valuemax')),
    said: (await steps.getAttribute('aria-valuetext')) ?? '',
  };
};

/** Whether Code shows this now, in its main page or its sidebar. */
const shows = async (walk: Walk, text: string) =>
  (await walk.page
    .locator('main, [role=complementary]')
    .getByText(text)
    .filter({ visible: true })
    .count()) > 0;

/**
 * Steps back along the Timeline, a Step at a time as the arrow key goes,
 * until Code no longer shows this text: the Step right before it showed.
 */
const backUntilGone = async (walk: Walk, dock: Locator, text: string) => {
  const steps = dock.getByRole('slider', { name: 'Steps' });
  await steps.focus();
  for (let back = 0; back < 120; back += 1) {
    if (!(await shows(walk, text))) return where(dock);
    if ((await where(dock)).at <= 1)
      throw new Error(`"${text}" shows at every Step kept`);
    await steps.press('ArrowLeft');
    await walk.page.waitForTimeout(120);
  }
  throw new Error(`"${text}" still shows 120 Steps back`);
};

const goToHead = async (dock: Locator) => {
  await dock.getByRole('button', { name: 'Go to Head' }).click();
  await dock.getByText('Running', { exact: true }).last().waitFor();
};

/** The Model of a Fake's Instance, read in the bubble, then the bubble closed. */
const fake = async (walk: Walk, address: string, keys: Array<string> = []) => {
  const read = await walk.bubble.model(address, keys);
  await walk.bubble.close();
  return read;
};

export const devtools: Scenario = {
  name: 'devtools',
  title: 'DevTools: History, Seek, Fork and the Inspector over Code',
  needs: ['projects'],
  run: async (walk) => {
    const { page } = walk;
    const sidebar = page.getByRole('complementary');

    walk.step('on shop, a new session');
    // A Window of 400 Steps, kept in the browser as DevTools' own setting
    // is: after the scenarios before, a Fork starts Code reading all it
    // follows anew, more than the 100 Steps kept by default, and the Step it
    // splits at would leave the Window before the Timeline is looked at.
    await page.evaluate(() =>
      localStorage.setItem('@kestack/kabuki:code:window', '400'),
    );
    // From home, whatever the scenarios before left open: shop's row there
    // opens its new session.
    await walk.go('/');
    await walk.main
      .getByRole('listitem')
      .filter({ hasText: '/home/you/code/shop' })
      .click();
    await walk.see('~/code/shop');

    walk.step('the bubble and the dock button both in reach, side by side');
    const bubbleBox = await walk.bubble.host
      .locator('button[aria-label="Fake world"]')
      .boundingBox();
    const dockBox = await page
      .getByRole('button', { name: 'Open Devtools' })
      .locator('..')
      .boundingBox();
    if (!bubbleBox || !dockBox) throw new Error('No bubble or no dock button');
    if (bubbleBox.y + bubbleBox.height > dockBox.y)
      throw new Error(
        `The bubble (${JSON.stringify(bubbleBox)}) covers the dock button (${JSON.stringify(dockBox)})`,
      );
    await walk.shot('corner');

    walk.step(
      "the dock opens on Code's Runtime: cards, and a Timeline of Steps",
    );
    let dock = await openDock(walk);
    await walk.see('Router', dock);
    await walk.see('Account', dock);
    const before = await where(dock);
    console.log(`  Head: ${before.at}/${before.of} ${before.said}`);
    await walk.shot('dock-open');
    await closeDock(walk);

    walk.step('a session on shop: its Steps join the History');
    const disk = await fake(walk, `${COMPUTER}/fileSystem`, ['tree']);
    await replyWith(walk, 'echo');
    await walk.bubble.close();
    await send(page, 'Say hello to the devtools');
    await walk.see('echo: Say hello to the devtools');
    await page
      .getByRole('button', { name: /About this turn/ })
      .first()
      .waitFor({ timeout: 20_000 });
    const first = page.url();
    dock = await openDock(walk);
    const after = await where(dock);
    console.log(`  Head: ${after.at}/${after.of} ${after.said}`);
    if (after.said === before.said)
      throw new Error(`The History did not move: ${after.said}`);
    await walk.shot('history-grew');

    walk.step('Seek back to before the session: Code draws the past');
    const past = await backUntilGone(walk, dock, 'Say hello to the devtools');
    console.log(`  Seeked: ${past.at}/${past.of} ${past.said}`);
    await dock.getByRole('button', { name: 'Go to Head' }).waitFor();
    await walk.shot('seeked-before-session');

    walk.step('the Fakes keep their state while Code shows the past');
    const agent = await fake(walk, 'Agent', ['replyWith']);
    if (!agent.includes('echo'))
      throw new Error(`The Agent fake moved with the Seek: ${agent}`);
    if ((await fake(walk, `${COMPUTER}/fileSystem`, ['tree'])) !== disk)
      throw new Error('The File System fake moved with the Seek');
    await walk.bubble.instance('Agent');
    await walk.shot('seeked-bubble', { bubble: true });
    // Open, the panel covers the Timeline's right end, Go to Head with it.
    await walk.bubble.close();

    walk.step('Go to Head: Code as it is again');
    dock = await openDock(walk);
    await goToHead(dock);
    await walk.see('echo: Say hello to the devtools');
    await walk.shot('back-at-head');

    walk.step('Fork from before the session; a new Message grows a new Branch');
    await backUntilGone(walk, dock, 'Say hello to the devtools');
    const fork = await where(dock);
    await dock.getByRole('button', { name: 'Fork' }).click();
    await dock.getByText('Running', { exact: true }).last().waitFor();
    console.log(`  Forked at: ${fork.at} ${fork.said}`);
    await closeDock(walk);
    await walk.shot('forked');
    // The Draft as it was at that Step, the first message half typed:
    // cleared, Code's first Messages after the Fork.
    await page
      .getByRole('textbox', { name: /^(First message|Message)$/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');

    walk.step('the Timeline offers both ways on from the Fork');
    // Looked at now, while the Step it splits at is still in the Window.
    dock = await openDock(walk);
    const grown = await where(dock);
    console.log(`  Head: ${grown.at}/${grown.of} ${grown.said}`);
    const ways = dock.getByRole('group', {
      name: 'Where it goes on from this Step',
    });
    const back = dock.getByRole('slider', { name: 'Steps' });
    await back.focus();
    for (let steps = 0; (await ways.count()) === 0; steps += 1) {
      if (steps > 400) throw new Error('No Step goes on in two ways');
      await back.press('ArrowLeft');
      await page.waitForTimeout(120);
    }
    const split = await where(dock);
    const count = await ways.getByRole('button').count();
    console.log(`  ${split.said} goes on ${count} ways`);
    if (count < 2)
      throw new Error(`The Fork goes on ${count} way, not 2 or more`);
    await walk.shot('branches');
    await goToHead(dock);
    await closeDock(walk);

    walk.step('a message on the new Branch starts a second session');
    await send(page, 'Hi there');
    await walk.see('echo: Hi there');
    if (page.url() === first)
      throw new Error('The new Message went to the first session');

    walk.step('the middle kept the session Code forgot: both listed');
    await walk.see('Say hello to the devtools', sidebar);
    await walk.see('Hi there', sidebar);
    await walk.shot('new-branch');

    walk.step(
      'a long reply streams on in the middle while Code shows the past',
    );
    await replyWith(walk, 'long');
    await walk.bubble.close();
    await send(page, 'Write it all out while I look back');
    await walk.see('Part 2.');
    dock = await openDock(walk);
    const steps = dock.getByRole('slider', { name: 'Steps' });
    await steps.focus();
    await steps.press('ArrowLeft');
    await dock.getByRole('button', { name: 'Go to Head' }).waitFor();
    await page.waitForTimeout(300);
    const frozen = await walk.main.innerText();
    await page.waitForTimeout(3_000);
    if ((await walk.main.innerText()) !== frozen)
      throw new Error('Code moved on while it showed a past Step');
    await walk.shot('long-reply-seeked');
    await goToHead(dock);
    await walk.says(walk.main, /Part \d+\./);
    if ((await walk.main.innerText()).length <= frozen.length)
      throw new Error('The reply did not stream on while Code showed the past');
    await walk.shot('long-reply-head');
    await closeDock(walk);
    await walk.button('Stop').click();
    await walk.button(/^Stopped by you/).waitFor();
    dock = await openDock(walk);

    walk.step("an Instance's card opens on its Snapshot: its Model");
    await dock.getByRole('button', { name: 'Show everything' }).click();
    const card = dock
      .locator('button[aria-expanded="false"]')
      .filter({ hasText: /^Account\s*Active/ })
      .first();
    await card.click();
    await card.waitFor({ state: 'detached' });
    await dock
      .getByRole('button', { name: /^Model/ })
      .first()
      .click();
    await walk.see('local_YWRhQGtlc3RhY2sudGVzdA', dock);
    await walk.shot('card');

    walk.step('the Blueprint: every Actor Code can grow');
    await dock.getByRole('tab', { name: 'Blueprint' }).click();
    await walk.see('Account', dock);
    await walk.shot('blueprint');
    await dock.getByRole('tab', { name: 'Running' }).click();
    await closeDock(walk);
    await page.evaluate(() =>
      localStorage.removeItem('@kestack/kabuki:code:window'),
    );
  },
};
