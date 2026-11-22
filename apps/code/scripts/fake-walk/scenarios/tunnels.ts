import type { Walk } from '../walker.ts';
import { listen, until } from './computers.ts';
import { COMPUTER, STUDIO } from './home.ts';
import type { Scenario } from './index.ts';

/*
 * Studio's tunnel as cloudflared and its check stand, through the
 * Computers fake, each seen in the header's pill and its title, the
 * Connections Drawer and the Settings card: cloudflared downloading, the
 * tunnel opening, failing and retried, up but not checked yet while the
 * socket links, out of reach with its problem, then reachable again; the
 * card locked while the Link is on its way for a while; the tunnel moving
 * to a new address, the socket dialled there. How soon Code notices each
 * change is how often it asks Connect Cloud: every 3 s while Studio is on
 * its way, every 10 s while it is stuck, never once it is linked.
 */

/** The header's pill, its words and its title, the words on hover. */
const pill = async (walk: Walk) => {
  const status = walk.page
    .locator('header [role="status"]')
    .filter({ visible: true })
    .first();
  return `${(await status.innerText()).trim()} — ${(await status.getAttribute('title')) ?? ''}`;
};

/** Waits until the header's pill says this; what it says then. */
const pillSays = async (walk: Walk, said: RegExp, timeout = 30_000) => {
  const start = Date.now();
  for (;;) {
    const now = await pill(walk).catch(() => '');
    if (said.test(now)) {
      console.log(`  pill: ${now} (${Date.now() - start} ms)`);
      return Date.now() - start;
    }
    if (Date.now() - start > timeout)
      throw new Error(`The pill says "${now}", not ${said}`);
    await walk.page.waitForTimeout(100);
  }
};

/** The Connections Drawer, opened from the sidebar's title; with `pick`, that Connection chosen in it. */
export const drawer = async (walk: Walk, name: string, pick?: string) => {
  const { page } = walk;
  await walk.bubble.close();
  await walk.button('Choose whose sessions to show').click();
  const opened = page.getByRole('dialog', { name: 'Connections' });
  await opened.waitFor();
  console.log(
    `  drawer: ${(await opened.innerText()).replace(/\s+/g, ' ').slice(0, 300)}`,
  );
  await walk.shot(name);
  if (pick === undefined) await page.keyboard.press('Escape');
  else
    await opened.getByRole('radio', { name: new RegExp(`^${pick}`) }).click();
  await opened.waitFor({ state: 'hidden' });
};

/** The second computer, Lab, as the bubble names it. */
export const LAB = 'Computers/computers[computer-2]';

export const tunnels: Scenario = {
  name: 'tunnels',
  title: "Studio's tunnel: downloading, opening, failed, unreachable, moved",
  needs: ['projects'],
  run: async (walk) => {
    const { page, bubble } = walk;
    await until(walk, /Linked/);

    walk.step('cloudflared downloading: 12 MB in 30 s');
    await bubble.must(COMPUTER, 'Download cloudflared', {
      megabytes: 12,
      seconds: 30,
    });
    await pillSays(
      walk,
      /Downloading cloudflared · 12\.0 MB, 30s — .*cloudflared/,
    );
    await walk.shot('downloading');

    walk.step(
      'while Studio is on its way, a computer comes online: Lab shows up by itself',
    );
    await bubble.must('Computers', 'Add computer', {
      name: 'Lab',
      keConnectVersion: '9.0.0',
      signedInAs: 'ada@kestack.test',
    });
    await bubble.close();
    const shown = Date.now();
    await walk.see('2 Connections', page.getByRole('complementary'));
    console.log(`  Lab shown after ${Date.now() - shown} ms`);
    await walk.shot('lab-shows-up');
    await drawer(walk, 'downloading-drawer', STUDIO);

    walk.step(
      'on its way, Code asks every 3 s: the tunnel opening is seen soon',
    );
    await bubble.must(COMPUTER, 'Open tunnel');
    const opening = await pillSays(
      walk,
      /Opening tunnel… — .*opening its tunnel/,
    );
    if (opening > 4_500)
      throw new Error(`Opening was seen after ${opening} ms, not within 3 s`);
    await walk.shot('opening');

    walk.step('the Settings card locked once the Link is on its way a while');
    await bubble.close();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Connections' }).click();
    const card = walk.main
      .getByRole('region', { name: 'Connections' })
      .locator('ul > li')
      .first();
    await walk.see('Opening tunnel…', card);
    await card
      .getByLabel("Its settings can't be changed until it is back")
      .waitFor({ timeout: 10_000 });
    const speech = card.getByRole('region', { name: 'Speech to Text' });
    if (!(await speech.getByRole('switch').isDisabled()))
      throw new Error('The Speech switch takes a tap while locked');
    await walk.shot('settings-locked');

    walk.step('the tunnel fails: retrying, its problem in the title');
    await bubble.must(COMPUTER, 'Fail tunnel', {
      problem: 'cloudflared exited with code 1',
    });
    await walk.says(card, /Tunnel failed · retrying/, 10_000);
    await walk.shot('failed-settings');
    await page.goBack();
    await pillSays(
      walk,
      /Tunnel failed · retrying — .*cloudflared exited with code 1/,
    );
    await walk.shot('failed');
    await drawer(walk, 'failed-drawer');

    walk.step(
      'stuck, Code asks every 10 s: up and unchecked is seen late, Connecting… while the socket links',
    );
    // A moment after an ask, so the next one is a full pace away.
    await page.waitForTimeout(1_000);
    const heard = await listen(walk);
    await bubble.must(COMPUTER, 'Tunnel unchecked');
    const start = Date.now();
    await until(walk, /Linked/, 20_000);
    const relinked = Date.now() - start;
    console.log(`  sidebar said: ${(await heard()).join(' → ')}`);
    if (relinked < 3_500)
      throw new Error(
        `Seen after ${relinked} ms: asked faster than every 10 s`,
      );
    if (!(await heard()).some((said) => /Connecting…/.test(said)))
      throw new Error('Never said Connecting… while the socket linked');
    await walk.shot('unchecked-linked');

    walk.step('out of reach, with its problem: the socket drops');
    await bubble.must(COMPUTER, 'Tunnel unreachable', {
      problem: 'the tunnel answered 530',
    });
    // Linked, Code asks nothing; the socket dropping starts the asking.
    await pillSays(walk, /Out of reach · seen .* — .*the tunnel answered 530/);
    await walk.shot('unreachable');
    await drawer(walk, 'unreachable-drawer');
    await bubble.close();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Connections' }).click();
    await walk.says(card, /Out of reach/);
    await card
      .getByLabel("Its settings can't be changed until it is back")
      .waitFor();
    await walk.shot('unreachable-settings');

    walk.step('reachable again: Linked');
    await bubble.must(COMPUTER, 'Tunnel reachable');
    await until(walk, /Linked/, 20_000);
    await walk.says(card, /Linked/);
    await walk.shot('reachable-settings');

    walk.step(
      'the tunnel moves: the socket drops, and is dialled at its new address',
    );
    await page.goBack();
    await until(walk, /Linked/);
    const moved = await listen(walk);
    await bubble.must(COMPUTER, 'Move tunnel');
    // Only a socket at the address listed now reaches it: linked again is there.
    await page.waitForTimeout(1_000);
    await until(walk, /Linked/, 20_000);
    const said = await moved();
    console.log(`  sidebar said: ${said.join(' → ')}`);
    if (!said.some((each) => /Connecting…/.test(each)))
      throw new Error('The socket never dropped as the tunnel moved');
    const sockets = await bubble.value(COMPUTER, ['sockets']);
    if (sockets !== 1)
      throw new Error(`Studio holds ${sockets} sockets, not 1`);
    await walk.shot('moved', { bubble: true });
  },
};
