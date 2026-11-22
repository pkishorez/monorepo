import type { Locator } from 'playwright-core';
import type { Walk } from '../walker.ts';
import { until } from './computers.ts';
import { COMPUTER } from './home.ts';
import type { Scenario } from './index.ts';
import { send } from './sessions.ts';
import { addComputer, drawer } from './tunnels.ts';

/*
 * More of Connections, with Studio and Lab, the computer the tunnels
 * scenario added. Lab's Project beside Studio's on home, each with its
 * Connection's name. Attic, added while every Link is up, so Code asks
 * nothing, shows up once the page is back after 15 s hidden; its Computer
 * Name `mac-mini.local (Attic)` said short; forgetting it refused while
 * Connect Cloud is out of reach; then it forgets itself and leaves. Lab
 * renamed on another device to Studio's name, told apart by its Computer
 * Name; Rename left with Escape, and emptied back to the Computer Name.
 * Pull to Reload on touch. Studio restarted with a reply running: the Turn
 * ends interrupted and is Resumed. Studio on another Release while Connect
 * Cloud is behind (Updating Connect…, relinking after 30 s), out of reach
 * (deciding nothing), and ahead (Updating Code…, Code moving to its newest
 * build once). The list kept on a reload while Connect Cloud is out of
 * reach; Lab forgotten on another device, pruned with its database on
 * Connect Cloud's first answer after a reload.
 */

/** Settings → Connections, and the card whose name is `name`. */
const card = async (walk: Walk, name: string | RegExp): Promise<Locator> => {
  const { page } = walk;
  await walk.bubble.close();
  if ((await page.getByRole('tablist', { name: 'Settings' }).count()) === 0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
  return walk.main
    .getByRole('region', { name: 'Connections' })
    .locator('ul > li')
    .filter({ has: page.getByRole('heading', { level: 3, name }) })
    .first();
};

/** How many Connections the sidebar's head says, when it says more than one. */
const counted = async (walk: Walk) =>
  /(\d+) Connections/.exec(
    await walk.page.getByRole('complementary').innerText(),
  )?.[1] ?? '1';

/** This page's IndexedDB databases, by name. */
const databases = (walk: Walk) =>
  walk.page.evaluate(async () =>
    (await indexedDB.databases()).map(({ name }) => name ?? '').sort(),
  );

/** Waits until the header (the Connection's pill or its notice) says this. */
const headerSays = (walk: Walk, said: RegExp, timeout = 30_000) =>
  walk.says(walk.page.locator('header').first(), said, timeout);

export const connections: Scenario = {
  name: 'connections',
  title: 'Two computers, names, Forget, Releases, restart, prune',
  needs: ['tunnels'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const lab = walk.kept.get('lab')!;
    await until(walk, /Linked/);

    walk.step("two computers: Lab's Project beside Studio's, on home");
    await bubble.must(`${lab}/fileSystem`, 'Add sample project', {
      folder: '~/code/api',
    });
    await drawer(walk, 'drawer-pick-lab', 'Lab');
    await page.keyboard.press('Control+p');
    const picker = page.getByRole('dialog', { name: 'Open a project' });
    const search = picker.getByRole('combobox');
    await search.fill('code');
    await picker
      .getByRole('option', { name: /Look for “code” under home/ })
      .click();
    await picker.getByRole('option', { name: 'code', exact: true }).click();
    await search.fill('api');
    await picker.getByRole('option', { name: 'api', exact: true }).waitFor();
    await page.keyboard.press('Control+Enter');
    await walk.see('~/code/api');

    walk.step('a Saved Draft on api, for the prune later');
    const draft = page
      .getByRole('textbox', { name: /^(First message|Message)$/ })
      .filter({ visible: true })
      .first();
    await draft.click();
    await page.keyboard.type('Draft kept on Lab');
    await walk.shot('api-draft');
    await drawer(walk, 'drawer-all', 'All Connections');
    await walk.go('/');
    await walk.says(walk.main, /api\s+Lab[\s\S]*shop\s+Studio/);
    await walk.shot('home-two');

    walk.step(
      'every Link up, Code asks nothing: Attic, added now, is not seen',
    );
    const attic = await addComputer(walk, 'mac-mini.local (Attic)');
    await bubble.close();
    await page.waitForTimeout(5_000);
    if ((await counted(walk)) !== '2')
      throw new Error('Attic was seen with every Link up');

    walk.step('the page hidden 16 s and back: the list asked at once');
    // A headless page is never hidden, whatever page is in front: the
    // page is told so as a browser tells it, its visibilityState and event.
    const visibility = (state: 'hidden' | 'visible') =>
      page.evaluate((now) => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => now,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await visibility('hidden');
    await page.waitForTimeout(16_000);
    await visibility('visible');
    const back = Date.now();
    await walk.says(page.getByRole('complementary'), /3 Connections/, 5_000);
    console.log(`  Attic seen ${Date.now() - back} ms after the page showed`);

    walk.step('Attic, its Computer Name `<host> (<name>)`, said short');
    await drawer(walk, 'attic-short', 'All Connections');
    if (
      (await page.getByRole('complementary').innerText()).includes(
        'mac-mini.local',
      )
    )
      throw new Error('The sidebar says the whole Computer Name');
    const attics = await card(walk, 'mac-mini.local (Attic)');
    await walk.see('Linked', attics);
    await walk.shot('attic-card');

    walk.step('forgetting Attic refused while Connect Cloud is out of reach');
    await bubble.must('Computers', 'Put cloud out of reach');
    await bubble.close();
    await walk.button('Forget mac-mini.local (Attic)').click();
    const asks = page.getByRole('alertdialog', {
      name: 'Forget mac-mini.local (Attic)?',
    });
    await walk.button('Forget', asks).click();
    await walk.see(/Connect Cloud is out of reach/, asks);
    await walk.shot('forget-refused');
    await walk.button('Keep it', asks).click();
    await asks.waitFor({ state: 'detached' });
    await bubble.must('Computers', 'Bring cloud back');

    walk.step('Attic forgets itself (`ke-connect remove`): it leaves the list');
    await bubble.must(attic, 'Forget itself');
    await bubble.close();
    await walk
      .button('Forget mac-mini.local (Attic)')
      .waitFor({ state: 'detached', timeout: 30_000 });
    await walk.shot('attic-left');

    walk.step(
      "Lab renamed on another device to Studio's name: told apart by its Computer Name",
    );
    const studioName = (
      await walk.main
        .getByRole('region', { name: 'Connections' })
        .locator('ul > li')
        .first()
        .getByRole('heading', { level: 3 })
        .innerText()
    ).trim();
    await bubble.must(lab, 'Rename elsewhere', { displayName: studioName });
    await bubble.close();
    await walk.button('Reload').click();
    // Lab's card, second: its Display Name, its Computer Name under it.
    const labs = walk.main
      .getByRole('region', { name: 'Connections' })
      .locator('ul > li')
      .nth(1);
    await walk.see(/^Lab$/, labs.locator('[title="Computer Name"]'));
    await walk.see(studioName, labs.getByRole('heading', { level: 3 }));
    await walk.shot('two-of-one-name');

    walk.step('Rename left with Escape: nothing changes');
    await walk.button(`Rename ${studioName}`, labs).click();
    await labs.getByRole('textbox', { name: 'Display Name' }).fill('Bench');
    await page.keyboard.press('Escape');
    await walk.see(studioName, labs.getByRole('heading', { level: 3 }));
    if ((await walk.main.getByText('Bench').count()) > 0)
      throw new Error('Escape saved Bench');

    walk.step('Rename to nothing: back to its Computer Name');
    await walk.button(`Rename ${studioName}`, labs).click();
    await labs.getByRole('textbox', { name: 'Display Name' }).fill('');
    await page.keyboard.press('Enter');
    const labCard = await card(walk, 'Lab');
    await walk.see('Lab', labCard.getByRole('heading', { level: 3 }));
    await walk.shot('rename-emptied');

    walk.step('Pull to Reload on touch: Shed, added now, shows on the pull');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });
    await page.reload();
    await walk.says(page.getByRole('complementary'), /2 Connections/);
    await page.waitForTimeout(2_000);
    const shed = await addComputer(walk, 'Shed');
    await bubble.close();
    await page.waitForTimeout(4_000);
    if ((await counted(walk)) !== '2')
      throw new Error('Shed was seen before the pull');
    const list = (await page.getByRole('complementary').boundingBox())!;
    const x = list.x + list.width / 2;
    const y = list.y + 120;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 12; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: y + step * 15 }],
      });
      await page.waitForTimeout(16);
    }
    await walk.shot('pulling');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await walk.says(page.getByRole('complementary'), /3 Connections/, 10_000);
    await walk.shot('pulled');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await bubble.must(shed, 'Forget elsewhere');

    walk.step(
      'Studio restarts with a reply running: interrupted, then Resumed',
    );
    await walk.go(walk.kept.get('shop')!);
    await walk.see('~/code/shop');
    await bubble.must('Agent', 'Reply with', { script: 'long' });
    await bubble.close();
    await send(page, 'Write it all out, then restart');
    await walk.see('Part 2.');
    await bubble.must(COMPUTER, 'Restart');
    await bubble.close();
    await page
      .getByRole('button', {
        name: /^Interrupted by the server.*About this turn/,
      })
      .first()
      .waitFor({ timeout: 30_000 });
    await walk.see('Resumed after Connect restarted');
    await walk.shot('restart-resumed');
    await bubble.must('Agent', 'Reply with', { script: 'echo' });
    await drawer(walk, 'drawer-studio', 'Studio');

    walk.step(
      'Studio on another Release, Connect Cloud behind (Unknown): Updating Connect…, relinks after 30 s',
    );
    await bubble.must('Computers', 'Cloud names an older release');
    const mismatched = Date.now();
    await bubble.must(COMPUTER, 'Run another release');
    await bubble.close();
    await headerSays(walk, /Updating Connect…/, 15_000);
    await walk.shot('unknown');
    await bubble.must('Computers', 'Cloud names this apps release');
    await bubble.must(COMPUTER, 'Run the named release');
    await bubble.close();
    await until(walk, /Linked/, 45_000);
    const relinked = Date.now() - mismatched;
    console.log(`  relinked ${relinked} ms after the mismatch`);
    if (relinked < 20_000)
      throw new Error(`Relinked after ${relinked} ms, not after 30 s`);

    walk.step(
      'another Release while Connect Cloud is out of reach: nothing decided, relinks slowly',
    );
    await bubble.must('Computers', 'Put cloud out of reach');
    const unasked = Date.now();
    await bubble.must(COMPUTER, 'Run another release');
    await bubble.close();
    await page.waitForTimeout(4_000);
    const header = await page.locator('header').first().innerText();
    console.log(`  header: ${header.replace(/\s+/g, ' ')}`);
    if (/Updating (Connect|Code)…/.test(header))
      throw new Error(`Decided while out of reach: ${header}`);
    await walk.shot('mismatch-out-of-reach');
    await bubble.must('Computers', 'Bring cloud back');
    await bubble.must(COMPUTER, 'Run the named release');
    await bubble.close();
    await until(walk, /Linked/, 45_000);
    const slow = Date.now() - unasked;
    console.log(`  relinked ${slow} ms after the mismatch`);
    if (slow < 20_000)
      throw new Error(`Relinked after ${slow} ms, not after 30 s`);

    walk.step('Connect Cloud out of reach, a reload opens with the list kept');
    await bubble.must('Computers', 'Put cloud out of reach');
    await bubble.close();
    await page.waitForTimeout(500);
    await page.reload();
    // A reload starts every computer's ke-connect in the tab again, and
    // one started waits for Connect Cloud to name its Plugins: Studio
    // links once it is back.
    await walk.see('Studio', page.getByRole('complementary'));
    await walk.shot('kept-list');
    if (!/Studio .*Lab /.test(await drawer(walk, 'kept-list-drawer')))
      throw new Error('The kept list does not hold Studio and Lab');
    await bubble.must('Computers', 'Bring cloud back');
    await until(walk, /Linked/, 30_000);

    walk.step(
      'Studio on another Release, Connect Cloud ahead (Older): Updating Code…, moving to the newest build once',
    );
    const asked = Number(await bubble.value('New build', ['asked']));
    const moved = Number(await bubble.value('New build', ['moved']));
    await bubble.must('New build', 'Reload when moving', { reload: true });
    await bubble.must('Computers', 'Cloud names a newer release');
    await bubble.must(COMPUTER, 'Run another release');
    await bubble.close();
    await headerSays(walk, /Updating Code…/, 15_000);
    await walk.shot('older');
    for (let tries = 0; ; tries += 1) {
      if (Number(await bubble.value('New build', ['asked'])) === asked + 1)
        break;
      if (tries > 40) throw new Error('Code never asked to move');
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(3_000);
    if (Number(await bubble.value('New build', ['asked'])) !== asked + 1)
      throw new Error('Code asked to move more than once');
    await walk.shot('older-waiting', { bubble: true });
    await bubble.send('New build', 'Put out newer build');
    await until(walk, /Linked/, 30_000);
    // Moved once, the page reloaded into the newest build: the Releases
    // that made Code the older side end with it, so it asks no more.
    if (Number(await bubble.value('New build', ['moved'])) !== moved + 1)
      throw new Error('Code never moved to its newest build');
    if (Number(await bubble.value('New build', ['asked'])) !== asked + 1)
      throw new Error('Code asked to move again after moving');
    await walk.shot('older-moved');

    walk.step(
      "Lab forgotten on another device: pruned on Connect Cloud's first answer, its database with it",
    );
    const id = /\[(.*)\]$/.exec(lab)![1];
    const labDatabase = `code:account:${walk.kept.get('account')}:connection:${id}`;
    if (!(await databases(walk)).includes(labDatabase))
      throw new Error(
        `No ${labDatabase} before the prune: ${(await databases(walk)).join(', ')}`,
      );
    await bubble.must(lab, 'Forget elsewhere');
    await bubble.close();
    await page.waitForTimeout(500);
    await page.reload();
    await until(walk, /Linked/, 30_000);
    for (let tries = 0; ; tries += 1) {
      if (!(await databases(walk)).includes(labDatabase)) break;
      if (tries > 40) throw new Error(`${labDatabase} is kept`);
      await page.waitForTimeout(250);
    }
    // One Connection left: the sidebar's title chooses nothing.
    await walk
      .button('Choose whose sessions to show')
      .waitFor({ state: 'detached', timeout: 15_000 });
    await walk.shot('lab-pruned');
  },
};
