import type { Walk } from '../walker.ts';
import { DISK } from './projects.ts';
import type { Scenario } from './index.ts';
import {
  LOFT,
  act,
  row,
  settledCount,
  swipe,
  tap,
  touch,
  until,
  vim,
} from './pickers.ts';
import { replyWith, send } from './sessions.ts';
import { addComputer, drawer } from './tunnels.ts';

/*
 * The sidebar over Studio and Loft. A new session's page puts nothing in
 * it; a session shows once started, its Project first as the most recently
 * active, its heading with its branch opening a new session. The
 * Connection Filter, from the Connections Drawer, which counts the
 * sessions and projects only of the Connections the sidebar shows, the
 * only ones read here; kept across a reload. A computer never synced
 * here, chosen, says how far it got; forgotten, the sidebar shows every
 * Connection. A Connection's Projects collapsed, kept, and skipped by
 * Ctrl+]. The Connections ordered by activity, one out of reach last, its
 * sessions still opening from what was synced; a Move it cannot take
 * refused at once and said; one it can shown at once. The Settled List,
 * its Un-settle, a send un-settling, and empty. Its width dragged and
 * kept. On a phone, the sidebar is home, with You and New project at its
 * foot; a row swiped to Settle and undone at once comes back whole.
 */

/** The sidebar's Connection headings, in order, as drawn. */
const order = async (walk: Walk) =>
  (await walk.page.getByRole('complementary').innerText())
    .split('\n')
    .filter((line) => /^(LOFT|STUDIO)\b/.test(line))
    .map((line) => line.split(' ')[0])
    .join(' > ');

/** The sidebar's title: the Connection it shows, or All Connections. */
const title = async (walk: Walk) =>
  (await walk.button('Choose whose sessions to show').innerText()).split(
    '\n',
  )[0];

export const sidebar: Scenario = {
  name: 'sidebar',
  title:
    'Sidebar: Projects, Connection Filter, collapse, order, Moves, width, phone',
  needs: ['pickers'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const side = page.getByRole('complementary');
    const loft = walk.kept.get('loft')!;
    const loftId = /computer-\d+/.exec(loft)![0];
    const projects = page.getByRole('dialog', { name: 'Open a project' });

    await vim(walk, false);

    walk.step("a new session's page puts nothing in the sidebar");
    await bubble.must(DISK, 'Add sample project', { folder: '~/code/blog' });
    await replyWith(walk, 'echo');
    await bubble.close();
    const rows = side.locator('a[data-slot=sidebar-menu-button]');
    const before = await rows.count();
    await page.keyboard.press('Control+p');
    await projects.getByRole('option', { name: /^Studio/ }).click();
    await projects.getByRole('option', { name: /Open a folder/ }).click();
    await projects.getByRole('combobox').fill('~/code/blog');
    await projects.getByRole('option', { name: 'blog', exact: true }).waitFor();
    await page.keyboard.press('Control+Enter');
    await walk.see('~/code/blog');
    await page.waitForTimeout(1_000);
    if ((await rows.count()) !== before)
      throw new Error("A new session's page put a row in the sidebar");
    await walk.shot('new-page-nothing');

    walk.step('started, it shows, its Project first, under its branch');
    await send(page, 'Start the blog');
    await walk.see('echo: Start the blog');
    await row(walk, 'Start the blog').waitFor();
    // Studio first, blog first in it, shop below, each under its branch,
    // whichever shop's folder is on by now.
    await until(
      walk,
      'blog first, then shop, Studio first',
      async () => await side.innerText(),
      (now) =>
        /\nSTUDIO[^\n]*\nblog\nmain\nStart the blog\n[\s\S]*\nshop\n[^\n]+\n/.test(
          now,
        ) && now.indexOf('STUDIO') < now.indexOf('LOFT'),
    );
    await walk.shot('two-projects');

    walk.step("shop's heading opens its new session's page");
    await side
      .getByRole('link', { name: /^shop .*New session$/ })
      .first()
      .click();
    await walk.see('~/code/shop');
    await page
      .getByRole('textbox', { name: 'First message' })
      .filter({ visible: true })
      .waitFor();
    if ((await side.locator('[title="New session in shop"]').count()) === 0)
      throw new Error("shop's heading has no plus");

    walk.step('the Connections Drawer counts what the sidebar shows');
    // Studio, then Loft, each counted: what each says, apart.
    const parts = (said: string) => ({
      all: said.slice(0, said.indexOf('Studio')),
      studio: said.slice(said.indexOf('Studio'), said.indexOf(LOFT)),
      loft: said.slice(said.indexOf(LOFT)),
    });
    const counted = /\d+ sessions? · \d+ projects?/;
    let said = parts(await drawer(walk, 'drawer-all'));
    if (![said.all, said.studio, said.loft].every((part) => counted.test(part)))
      throw new Error(
        `The Drawer does not count each: ${JSON.stringify(said)}`,
      );
    await drawer(walk, 'drawer-pick-loft', LOFT);
    await until(
      walk,
      'the sidebar on Loft',
      () => title(walk),
      (now) => now === LOFT,
    );
    said = parts(await drawer(walk, 'drawer-loft'));
    if (
      counted.test(said.all) ||
      counted.test(said.studio) ||
      !counted.test(said.loft)
    )
      throw new Error(
        `The Drawer counts what it did not read: ${JSON.stringify(said)}`,
      );

    walk.step('the Filter is kept across a reload');
    await page.reload();
    await walk.button('Choose whose sessions to show').waitFor();
    await until(
      walk,
      'still on Loft',
      () => title(walk),
      (now) => now === LOFT,
    );
    await walk.shot('filter-kept');

    walk.step('a computer never synced here, chosen, says how far it got');
    const nook = await addComputer(walk, 'Nook');
    await bubble.must(nook, 'Download cloudflared', {
      megabytes: 12,
      seconds: 30,
    });
    await bubble.close();
    await page.reload();
    await walk.button('Choose whose sessions to show').waitFor();
    await drawer(walk, 'drawer-nook', 'Nook');
    await walk.says(side, /Nook\s+Downloading cloudflared/);
    await walk.shot('never-synced-downloading');
    await bubble.must(nook, 'Open tunnel');
    await bubble.close();
    await walk.says(side, /Nook\s+Opening tunnel/);
    await walk.shot('never-synced-opening');
    await bubble.must(nook, 'Tunnel reachable');
    await bubble.close();
    await walk.says(side, /No sessions yet/, 30_000);

    walk.step(
      'forgotten, no longer listed: the sidebar shows every Connection',
    );
    await bubble.must(nook, 'Forget elsewhere');
    await bubble.close();
    await page.getByRole('button', { name: 'Reload the Connections' }).click();
    await until(
      walk,
      'All Connections',
      () => title(walk),
      (now) => now === 'All Connections',
      30_000,
    );
    await walk.shot('nook-forgotten');

    walk.step("Studio's Projects collapsed: kept, and skipped by Ctrl+]");
    await walk.go(walk.kept.get('hello-loft')!);
    await walk.see('echo: Hello Loft');
    const studio = side.getByRole('button', { name: /^Studio/ });
    await studio.click();
    await walk.says(side, /STUDIO[^\n]* \(\d+ projects?\)/);
    await page.reload();
    await walk.button('Choose whose sessions to show').waitFor();
    await walk.says(side, /STUDIO[^\n]* \(\d+ projects?\)/);
    await walk.shot('collapsed');
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Control+]');
      await page.waitForTimeout(600);
      if (!page.url().includes(`/m/${loftId}/`))
        throw new Error(
          `Ctrl+] went into a collapsed Connection: ${page.url()}`,
        );
    }
    await side.getByRole('button', { name: /^Studio/ }).click();
    await until(
      walk,
      'Studio open again',
      () => side.innerText(),
      (now) => !/STUDIO[^\n]*\(\d+ projects?\)/.test(now),
    );

    walk.step('by activity, the one out of reach last, back as it returns');
    await walk.go(walk.kept.get('hello-loft')!);
    await walk.see('echo: Hello Loft');
    await send(page, 'Loft again');
    await walk.see('echo: Loft again');
    await until(
      walk,
      'Loft first',
      () => order(walk),
      (now) => now === 'LOFT > STUDIO',
    );
    await bubble.must(loft, 'Go offline', { downAtOnce: true });
    await bubble.close();
    await until(
      walk,
      'Loft last, out of reach',
      () => order(walk),
      (now) => now === 'STUDIO > LOFT',
      30_000,
    );
    await walk.says(side, /LOFT\s+seen /);
    await walk.shot('loft-out-of-reach-last');

    walk.step('its sessions open from what was synced, out of reach');
    await row(walk, 'Start the blog').click();
    await walk.see('echo: Start the blog');
    await row(walk, 'Hello Loft').click();
    await walk.see('echo: Loft again');
    await walk.see(/Connection down/, page.locator('header').first());
    await walk.shot('prefetched-offline');

    walk.step('a Move Loft cannot take: refused at once, said, the row stays');
    const settled = await settledCount(walk);
    await act(walk, /^Settle/);
    await walk.see('Not Settled');
    await walk.see('The Connection could not be reached');
    await walk.shot('move-refused');
    await row(walk, 'Hello Loft').waitFor();
    if ((await settledCount(walk)) !== settled)
      throw new Error('A refused Settle was counted');

    await bubble.must(loft, 'Come online');
    await bubble.close();
    await until(
      walk,
      'Loft first again',
      () => order(walk),
      (now) => now === 'LOFT > STUDIO',
      30_000,
    );

    walk.step('a Move Loft takes shows at once');
    await walk.gone('Not Settled');
    const put = Date.now();
    await act(walk, /^Settle/);
    await row(walk, 'Hello Loft').waitFor({
      state: 'detached',
      timeout: 2_000,
    });
    console.log(`  gone from the list after ${Date.now() - put} ms`);
    await until(
      walk,
      'one more Settled',
      () => settledCount(walk),
      (now) => now === settled + 1,
    );

    walk.step(
      'the Settled List: most recently Settled first, Un-settle on each',
    );
    await side.getByRole('button', { name: /^Settled/ }).click();
    const list = side.locator('section[aria-label=Settled]');
    await list.getByRole('button', { name: 'Un-settle Hello Loft' }).waitFor();
    const first = (await list.innerText()).split('\n')[2];
    if (first !== 'Hello Loft')
      throw new Error(`The most recently Settled is not first: ${first}`);
    await walk.shot('settled-list');

    walk.step('sending to a Settled session un-settles it');
    await list
      .locator('a[data-slot=sidebar-menu-button]')
      .filter({ hasText: 'Hello Loft' })
      .click();
    await walk.see('echo: Loft again');
    await send(page, 'Not done yet');
    await walk.see('echo: Not done yet');
    await until(
      walk,
      'un-settled by the send',
      () => settledCount(walk),
      (now) => now === settled,
    );
    await row(walk, 'Hello Loft').waitFor();

    walk.step('Un-settle each in the list: empty, it says how to Settle');
    for (;;) {
      const unsettle = list.getByRole('button', { name: /^Un-settle / });
      if ((await unsettle.count()) === 0) break;
      await unsettle.first().click();
      await page.waitForTimeout(500);
    }
    await walk.see(
      /Nothing is Settled\. Settle a session you are done with/,
      side,
    );
    await walk.shot('settled-empty');
    await side.getByRole('button', { name: /^Settled/ }).click();

    walk.step('its width dragged, kept across a reload, then back');
    const edge = page.getByRole('separator', { name: 'Resize the sidebar' });
    const drag = async (by: number) => {
      const box = (await edge.boundingBox())!;
      const x = box.x + box.width / 2;
      await page.mouse.move(x, 400);
      await page.mouse.down();
      for (let step = 1; step <= 10; step += 1) {
        await page.mouse.move(x + (by * step) / 10, 400);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(600);
    };
    const width = Number(await edge.getAttribute('aria-valuenow'));
    await drag(80);
    if (Number(await edge.getAttribute('aria-valuenow')) !== width + 80)
      throw new Error('The sidebar did not widen');
    await page.reload();
    await walk.button('Choose whose sessions to show').waitFor();
    await until(
      walk,
      'the width kept',
      async () => Number(await edge.getAttribute('aria-valuenow')),
      (now) => now === width + 80,
    );
    await walk.shot('wider-kept');
    await drag(-80);
    if (Number(await edge.getAttribute('aria-valuenow')) !== width)
      throw new Error('The sidebar did not narrow back');

    walk.step(
      'on a phone the sidebar is home: You and New project at its foot',
    );
    const cdp = await touch(walk, true);
    await walk.see('echo: Not done yet');
    await tap(
      cdp,
      page
        .getByRole('button', { name: 'Back' })
        .filter({ visible: true })
        .first(),
    );
    const you = page
      .getByRole('button', { name: 'You, theme and settings' })
      .filter({ visible: true })
      .first();
    await you.waitFor();
    await page
      .getByRole('button', { name: 'Open a project' })
      .filter({ visible: true })
      .first()
      .waitFor();
    await walk.shot('phone-home');
    await tap(cdp, you);
    const yours = page.getByRole('dialog', { name: 'You' });
    await yours.waitFor();
    await walk.see('ada@kestack.test', yours);
    await walk.see('Settings', yours);
    await walk.shot('phone-you');
    // A tap on what it dims: Escape would leave the sidebar for the page.
    await tap(cdp, { x: 195, y: 60 });
    await yours.waitFor({ state: 'detached' });
    await page.waitForTimeout(500);

    walk.step('a row swiped to Settle, undone at once, comes back whole');
    const swiped = row(walk, 'Hello Loft');
    const box = (await swiped.boundingBox())!;
    await swipe(
      walk,
      cdp,
      { x: box.x + 30, y: box.y + box.height / 2 },
      260,
      0,
    );
    const undo = page
      .getByRole('button', { name: 'Undo' })
      .filter({ visible: true })
      .first();
    await undo.waitFor({ timeout: 5_000 });
    await walk.shot('swiped-settled');
    await tap(cdp, undo);
    await until(
      walk,
      'the row back whole',
      () => swiped.boundingBox(),
      (now) => now !== null && now.height > 30 && now.x >= 0 && now.x < 60,
    );
    await until(
      walk,
      'not Settled',
      () => settledCount(walk),
      (now) => now === settled,
    );
    await walk.shot('swipe-undone');

    walk.step('back to a wide screen; Loft forgotten, Studio alone again');
    await touch(walk, false);
    await bubble.must(loft, 'Forget elsewhere');
    await bubble.close();
    await page.waitForTimeout(500);
    await walk.go('/');
    await walk
      .button('Choose whose sessions to show')
      .waitFor({ state: 'detached', timeout: 30_000 });
  },
};
