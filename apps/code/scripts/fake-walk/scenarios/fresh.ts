import type { Scenario } from './index.ts';

/*
 * Start fresh, from the bubble: confirmed, the page reloads with nothing
 * kept, every Fake blank and Code's own databases gone: signed out, and
 * once signed in again, no Connection. The reload keeps the page's
 * address, so a sign-in comes back to a Connection no longer there, as a
 * link to one forgotten does. Fresh again, signed in while Connect Cloud
 * is out of reach: with no list kept, home says it can't reach it, and
 * asks again once it is back.
 */
export const fresh: Scenario = {
  name: 'start-fresh',
  title: 'Start fresh: every Fake blank, Code signed out, nothing kept',
  needs: ['home'],
  run: async (walk) => {
    const { page, bubble } = walk;
    walk.step('Start fresh in the bubble, confirmed');
    await bubble.open();
    page.once('dialog', (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForEvent('load'),
      bubble.host.getByRole('button', { name: 'Start fresh' }).click(),
    ]);

    walk.step('signed out, every Fake blank');
    await walk.see('Continue with Google');
    await walk.shot('signed-out');
    const accounts = await bubble.model('Sign-in', ['accounts']);
    const computers = await bubble.model('Computers', ['computers']);
    if (!/\[\s*\]/.test(accounts) || !/\[\s*\]/.test(computers))
      throw new Error(
        `Not blank: accounts ${accounts}, computers ${computers}`,
      );
    await walk.shot('bubble-blank', { bubble: true });
    await bubble.close();

    walk.step('nothing of Code kept: only what this start made');
    const databases = await page.evaluate(async () =>
      (await indexedDB.databases()).map(({ name }) => name ?? ''),
    );
    console.log(`  databases now: ${databases.join(', ')}`);
    if (databases.some((name) => name.startsWith('code:account:')))
      throw new Error(`An Account's database is kept: ${databases.join(', ')}`);

    walk.step('signed in again as Ada, at the page it was on');
    await page.getByText('Continue with Google').click();
    await bubble.must('Sign-in', 'Sign in as', { email: 'ada', name: 'Ada' });
    const landed = await walk.see(
      /No Connection yet|This Connection is not one of yours any more/,
    );
    await walk.shot('signed-in-again');
    if (!(await landed.innerText()).includes('No Connection yet')) {
      walk.step('a Connection no longer there: home has no Connection');
      await walk.go('/');
      await walk.see('No Connection yet');
      await walk.shot('no-connection');
    }

    walk.step(
      'fresh again, signed in while Connect Cloud is out of reach: no list kept',
    );
    await bubble.open();
    page.once('dialog', (dialog) => void dialog.accept());
    await Promise.all([
      page.waitForEvent('load'),
      bubble.host.getByRole('button', { name: 'Start fresh' }).click(),
    ]);
    await walk.see('Continue with Google');
    await bubble.must('Computers', 'Put cloud out of reach');
    await bubble.close();
    await page.getByText('Continue with Google').click();
    await bubble.must('Sign-in', 'Sign in as', { email: 'ada', name: 'Ada' });
    await walk.see("Can't reach Connect Cloud", walk.main);
    await walk.see(/out of reach/, walk.main);
    await walk.shot('cloud-out-of-reach');
    await bubble.must('Computers', 'Bring cloud back');
    await bubble.close();
    await walk.button('Try again').click();
    await walk.see('No Connection yet');
    await walk.shot('cloud-back');
  },
};
