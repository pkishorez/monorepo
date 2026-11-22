import type { Walk } from '../walker.ts';
import { until } from './computers.ts';
import { COMPUTER, STUDIO } from './home.ts';
import type { Scenario } from './index.ts';
import { DISK } from './projects.ts';
import { replyWith, send } from './sessions.ts';

/*
 * A reload keeps the world: Ada signed in, Studio online at its key and
 * tunnel, shop on its disk with its git state, a session of a few turns
 * with a long reply still running, Speech to Text Ready, the microphone
 * allowed, the Agent's Script and the New build's choice. After the
 * reload all of it is as it was, but what a reload ends: the running reply
 * ends interrupted, as on a computer's restart, and is Resumed once; the
 * microphone blocked until the reload is not.
 */

/** What the bubble shows of each Fake, read as text, to set beside the same after the reload. */
const world = async (walk: Walk) => {
  const { bubble } = walk;
  const read = {
    accounts: await bubble.model('Sign-in', ['accounts']),
    active: await bubble.model('Sign-in', ['active']),
    online: await bubble.model(COMPUTER, ['online']),
    starts: await bubble.model(COMPUTER, ['starts']),
    keys: await bubble.model(COMPUTER, ['keys']),
    moves: await bubble.model(COMPUTER, ['moves']),
    // The bubble shows 100 paths a level: newthing, made from the app, is among them.
    newthing: String(
      (await bubble.model(DISK, ['tree'])).includes('/home/you/code/newthing'),
    ),
    replyWith: await bubble.model('Agent', ['replyWith']),
    installed: await bubble.model('Speech', ['installed']),
    wished: await bubble.model('Speech', ['wished']),
    permission: await bubble.model('Microphone', ['permission']),
    reloads: await bubble.model('New build', ['reloads']),
  };
  await bubble.close();
  return read;
};

/** Settings → Connections, unless open there already, as the settings scenario leaves it. */
const connections = async (walk: Walk) => {
  const { page } = walk;
  if ((await page.getByRole('tablist', { name: 'Settings' }).count()) === 0)
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Connections' }).click();
};

/** The footers of the Turns ended so far. */
const footers = (walk: Walk) =>
  walk.page.getByRole('button', { name: /About this turn/ });

export const reload: Scenario = {
  name: 'reload',
  title: 'A reload keeps the world; a running reply ends interrupted',
  needs: ['projects'],
  run: async (walk) => {
    const { page, bubble } = walk;

    walk.step('Speech to Text on, downloaded: Ready');
    await bubble.must('Speech', 'Let downloads run');
    await bubble.close();
    await connections(walk);
    const speech = walk.main.getByRole('region', { name: 'Speech to Text' });
    if (!(await speech.getByRole('switch').isChecked()))
      await speech.getByRole('switch').check();
    await walk.says(speech, /Ready · ctrl\+Space dictates anywhere/, 30_000);

    walk.step(
      'the microphone allowed, and blocked until the reload; moving to a new build only says so',
    );
    await bubble.must('Microphone', 'Allow microphone');
    await bubble.must('Microphone', 'Block until reload');
    await bubble.must('New build', 'Reload when moving', { reload: false });

    walk.step('a new session on shop: an echo, words, then a long reply');
    await bubble.close();
    // Back to shop: its New session in the sidebar once it has sessions,
    // else as the browser's Back goes, without loading the page.
    const newSession = page
      .getByRole('complementary')
      .getByRole('link', { name: /^shop .*New session$/ });
    if ((await newSession.count()) > 0) await newSession.click();
    else {
      const shop = walk.kept.get('shop');
      for (let back = 0; page.url() !== shop; back += 1) {
        if (back > 20) throw new Error(`Never back at shop: ${page.url()}`);
        await page.goBack();
      }
    }
    await walk.see('~/code/shop');
    // The branch shop is on, as the scenarios before left it.
    const branch =
      (await walk.button(/^Branch: /).getAttribute('aria-label')) ??
      (await walk.button(/^Branch: /).innerText());
    await replyWith(walk, 'echo');
    await bubble.close();
    await send(page, 'Say hello again');
    await walk.see('echo: Say hello again');
    await footers(walk).first().waitFor({ timeout: 20_000 });
    await replyWith(walk, 'words');
    await bubble.close();
    await send(page, 'Explain the store once more');
    await walk.see('What changes');
    await footers(walk).nth(1).waitFor({ timeout: 20_000 });
    await replyWith(walk, 'long');
    await bubble.close();
    await send(page, 'Write it all out, then reload');
    await walk.see('Part 2.');
    const session = page.url();
    await walk.shot('before-running');

    const before = await world(walk);
    if (!before.permission.includes('Allowed'))
      throw new Error(`The microphone is not allowed: ${before.permission}`);
    const blocked = await bubble.model('Microphone', ['untilReload']);
    if (!blocked.includes('true'))
      throw new Error(`The microphone is not blocked: ${blocked}`);
    await bubble.close();

    walk.step('reload, the reply still running');
    // As a person would: the last change is a moment old, so saved.
    await page.waitForTimeout(500);
    await page.reload();

    walk.step('still Ada, on the same session, Studio linked again');
    if (page.url() !== session)
      throw new Error(`The reload left ${session} for ${page.url()}`);
    await walk.see('echo: Say hello again');
    await walk.see('What changes');
    await walk.see('Part 2.');
    await until(walk, /Linked/, 30_000);
    await walk.see(STUDIO, page.getByRole('complementary'));

    walk.step('the running reply ended interrupted, and is Resumed once');
    await page
      .getByRole('button', {
        name: /^Interrupted by the server.*About this turn/,
      })
      .first()
      .waitFor({ timeout: 30_000 });
    await walk.shot('interrupted');

    walk.step('every Fake as it was, but what a reload ends');
    const after = await world(walk);
    for (const [what, was] of Object.entries(before)) {
      const now = after[what as keyof typeof after];
      if (now !== was)
        throw new Error(`${what} was ${was}, now ${now} after the reload`);
      console.log(`  kept ${what}: ${was.replace(/\s+/g, ' ').slice(0, 80)}`);
    }
    const unblocked = await bubble.model('Microphone', ['untilReload']);
    if (!unblocked.includes('false'))
      throw new Error(`The microphone is still blocked: ${unblocked}`);
    const replies = await bubble.model('Agent', ['replies']);
    console.log(
      `  Agent replies now: ${replies.replace(/\s+/g, ' ').slice(0, 120)}`,
    );
    await walk.shot('bubble-after', { bubble: true });

    walk.step('Speech to Text still Ready in Settings');
    await bubble.close();
    await connections(walk);
    await walk.says(
      walk.main.getByRole('region', { name: 'Speech to Text' }),
      /Ready · ctrl\+Space dictates anywhere/,
      30_000,
    );
    await walk.shot('speech-ready');

    walk.step('shop still a git Project on the same branch');
    await page
      .getByRole('complementary')
      .getByRole('link', { name: /^shop .*New session$/ })
      .click();
    await walk.button(branch).waitFor();
    console.log(`  kept ${branch}`);
    await walk.shot('shop-after');
    await bubble.must('New build', 'Reload when moving', { reload: true });
  },
};
