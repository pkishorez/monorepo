import type { Walk } from '../walker.ts';
import { COMPUTER } from './home.ts';
import type { Scenario } from './index.ts';

/*
 * Studio as a computer comes and goes, through the Computers fake: offline
 * (Down at once) and back, Linked again; a restart; its key rotated; another
 * Release of the code Plugin run, then this Code's again; Connect Cloud out
 * of reach and back; a `ke-connect` older than the Minimum Connect, then
 * updated.
 */

/** What the sidebar's head says of the Connection, and the header's pill, if any. */
const standing = async (walk: Walk) => {
  const head = (await walk.page.getByRole('complementary').innerText())
    .split('\n')
    .slice(0, 2)
    .join(' · ');
  const pills = await walk.main.getByRole('status').allInnerTexts();
  return [head, ...pills].join(' | ');
};

/** Follows what the sidebar's head says, every change; read it later. */
const listen = async (walk: Walk) => {
  await walk.page.evaluate(() => {
    const head = document.querySelector('aside, [role="complementary"]');
    const said: Array<string> = [];
    const note = () => {
      const now =
        (head as HTMLElement | null)?.innerText
          .split('\n')
          .slice(0, 2)
          .join(' · ') ?? '';
      if (said.at(-1) !== now) said.push(now);
    };
    note();
    new MutationObserver(note).observe(head ?? document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    (window as unknown as { walkHeard: Array<string> }).walkHeard = said;
  });
  return () =>
    walk.page.evaluate(
      () => (window as unknown as { walkHeard: Array<string> }).walkHeard,
    );
};

/** Waits until the sidebar's head says this of Studio. */
export const until = async (walk: Walk, said: RegExp, timeout = 30_000) => {
  const start = Date.now();
  for (;;) {
    const now = await standing(walk);
    if (said.test(now)) {
      console.log(`  sidebar: ${now} (${Date.now() - start} ms)`);
      return;
    }
    if (Date.now() - start > timeout)
      throw new Error(`The sidebar says "${now}", not ${said}`);
    await walk.page.waitForTimeout(250);
  }
};

export const computers: Scenario = {
  name: 'computers',
  title: 'Offline and back, restart, key, Release, Connect Cloud, Outdated',
  needs: ['sessions'],
  run: async (walk) => {
    const { page, bubble } = walk;
    await until(walk, /Linked/);

    walk.step('Studio goes offline: Down at once');
    await bubble.must(COMPUTER, 'Go offline', { downAtOnce: true });
    await until(walk, /Connection down/);
    await walk.see('Connection down', walk.main);
    await walk.shot('offline');

    walk.step('Studio back online: Linked again');
    await bubble.must(COMPUTER, 'Come online');
    await until(walk, /Linked/);
    await walk.shot('back-online');

    walk.step('its key rotates; the open socket stays, as ke-connect keeps it');
    await bubble.must(COMPUTER, 'Rotate key');
    await page.waitForTimeout(1000);
    await until(walk, /Linked/);

    walk.step(
      'Studio restarts: KEY_EXPIRED on the old key, the list asked, linked',
    );
    const heard = await listen(walk);
    await bubble.must(COMPUTER, 'Restart');
    await until(walk, /Linked/);
    await page.waitForTimeout(1000);
    console.log(`  sidebar said: ${(await heard()).join(' → ')}`);
    await walk.shot('restarted');

    walk.step(
      "it runs another Release: Updating Connect…, then this Code's again",
    );
    await bubble.must(COMPUTER, 'Run another release');
    await until(walk, /Updating Connect/, 15_000);
    await walk.shot('another-release');
    await bubble.must(COMPUTER, 'Run the named release');
    await until(walk, /Linked/);
    await walk.shot('named-release');

    walk.step(
      'Connect Cloud out of reach: the list kept stays, Studio still linked',
    );
    await bubble.must('Computers', 'Put cloud out of reach');
    await bubble.close();
    await page.getByRole('button', { name: 'Reload the Connections' }).click();
    await page.waitForTimeout(2000);
    await until(walk, /Linked/);
    await walk.shot('cloud-out-of-reach');
    await bubble.must('Computers', 'Bring cloud back');
    await bubble.close();
    await page.getByRole('button', { name: 'Reload the Connections' }).click();
    await until(walk, /Linked/);

    walk.step(
      'ke-connect older than the Minimum Connect: Outdated, then updated',
    );
    await bubble.must('Computers', 'Set minimum connect', { version: '2.0.0' });
    // Its next Heartbeat, within 15 s, is refused Outdated, and it stops.
    await until(walk, /Update ke-connect/, 30_000);
    await walk.shot('outdated');
    await walk.main
      .getByRole('status')
      .filter({ hasText: 'Update ke-connect' })
      .first()
      .click();
    await walk.see('npm i -g @kestack/connect@latest', walk.main);
    await walk.button('Copy the update command').click();
    await walk.see('Copied', walk.main);
    await walk.shot('outdated-settings');
    await bubble.must(COMPUTER, 'Update ke connect', { version: '2.0.0' });
    await until(walk, /Linked/, 30_000);
    await walk.shot('updated');
  },
};
