import type { Locator } from 'playwright-core';
import type { Walk } from '../walker.ts';
import { until } from './computers.ts';
import { COMPUTER, STUDIO } from './home.ts';
import type { Scenario } from './index.ts';

/*
 * Accounts, through the Sign-in fake: addresses that name no page, and old
 * ones placed under the Account active; the Auth Worker slow (Checking)
 * and out of reach; a second Account added from the switcher, with its
 * own computer, and switched between, each Account's sockets open only
 * while it is the one active (as the Computers fake counts them); the
 * switcher on a phone too; the page Away for each reason
 * (switched, added or signed out in another tab; a link for another
 * Account, or for one not signed in here); the browser full; signing out
 * of one and of all, and what is pruned; a sign-in abandoned or failing.
 * It ends as it began: Ada signed in, at home, Studio linked.
 */

/** A fake User's id, as the Sign-in fake makes it from the email alone. */
export const idOf = (email: string) =>
  `local_${Buffer.from(email).toString('base64url')}`;

const ADA = 'ada@kestack.test';
const GRACE = 'grace@kestack.test';
const HAL = 'hal@kestack.test';

/** Every IndexedDB database the page has now, by name. */
export const databases = (walk: Walk) =>
  walk.page.evaluate(async () =>
    (await indexedDB.databases()).map(({ name }) => name ?? '').sort(),
  );

/** The databases of one Account. */
const ofAccount = (names: ReadonlyArray<string>, id: string) =>
  names.filter((name) => name.startsWith(`code:account:${id}`));

/** The Account a path is under; empty for none. */
const accountIn = (walk: Walk) =>
  new URL(walk.page.url()).pathname.split('/')[1] === 'a'
    ? new URL(walk.page.url()).pathname.split('/')[2]!
    : '';

/** Waits until the page's address is under this Account. */
const placedUnder = async (walk: Walk, id: string, timeout = 15_000) => {
  const start = Date.now();
  while (accountIn(walk) !== id) {
    if (Date.now() - start > timeout)
      throw new Error(`At ${walk.page.url()}, not under ${id}`);
    await walk.page.waitForTimeout(200);
  }
};

/** The header's Account menu, opened. */
const switcher = async (walk: Walk): Promise<Locator> => {
  await walk.bubble.close();
  await walk.page
    .getByRole('button', { name: /^Accounts\. Signed in as / })
    .filter({ visible: true })
    .first()
    .click();
  const menu = walk.page.getByRole('menu').filter({ visible: true }).first();
  await menu.waitFor();
  return menu;
};

/** Waits until the Sign-in fake holds a sign-in asked, waiting for its answer. */
const asked = async (walk: Walk) => {
  for (let tries = 0; ; tries += 1) {
    const asking = await walk.bubble.model('Sign-in', ['asking']);
    if (!asking.endsWith('null')) return;
    if (tries > 50) throw new Error('No sign-in was asked');
    await walk.page.waitForTimeout(200);
  }
};

/** Adds an Account from the switcher, the bubble answering as `name`. */
const addAccount = async (walk: Walk, name: string) => {
  const menu = await switcher(walk);
  await menu.getByRole('menuitem', { name: 'Add another account' }).click();
  await asked(walk);
  await walk.bubble.must('Sign-in', 'Sign in as', {
    email: name,
    name: name[0]!.toUpperCase() + name.slice(1),
  });
  await placedUnder(walk, idOf(`${name}@kestack.test`));
  await walk.bubble.close();
};

/**
 * Reloads at a path once the Fakes' last change is saved: a Fake World
 * saves a moment after a change (`SAVE_AFTER`), and a write begun as the
 * page unloads may not land.
 */
const reload = async (walk: Walk, path: string) => {
  await walk.bubble.close();
  await walk.page.waitForTimeout(500);
  await walk.go(path);
};

/**
 * Waits until a computer's tunnel holds as many sockets as `wanted` says,
 * as the Computers fake counts them; returns how many.
 */
const sockets = async (
  walk: Walk,
  computer: string,
  wanted: (open: number) => boolean,
  what: string,
) => {
  for (let tries = 0; ; tries += 1) {
    const open = (await walk.bubble.value(computer, ['sockets'])) as number;
    if (wanted(open)) {
      console.log(`  ${computer}: ${open} socket(s) open`);
      await walk.bubble.close();
      return open;
    }
    if (tries > 50)
      throw new Error(`${computer} holds ${open} socket(s), not ${what}`);
    await walk.page.waitForTimeout(200);
  }
};
const noneOpen = (count: number) => count === 0;
const someOpen = (count: number) => count > 0;

/** The Away screen's title. */
const away = (walk: Walk, title: string | RegExp) =>
  walk.see(title, walk.page.getByRole('heading', { level: 1 }));

/** Chooses an Account on the Away screen. */
const choose = (walk: Walk, email: string) =>
  walk.page
    .getByRole('button', { name: email, exact: true })
    .filter({ visible: true })
    .first()
    .click();

export const accounts: Scenario = {
  name: 'accounts',
  title: 'Accounts: addresses, Checking, switcher, Away, full, sign out',
  needs: ['home'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const ada = idOf(ADA);
    const grace = idOf(GRACE);
    await bubble.close();
    await walk.go('/');
    await placedUnder(walk, ada);
    await until(walk, /Linked/);

    walk.step('an address that names no page: Nothing lives here, Go home');
    await walk.go('/nope');
    await walk.see('Nothing lives at this address');
    await walk.shot('nowhere');
    await walk.go(`/a/${ada}/nope`);
    await walk.see('Nothing lives at this address');
    await page.getByRole('link', { name: 'Go home' }).click();
    await placedUnder(walk, ada);
    await walk.see(STUDIO, page.getByRole('complementary'));

    walk.step('old addresses go to the same page under the Account active');
    await walk.go('/settings');
    await placedUnder(walk, ada);
    if (!page.url().endsWith(`/a/${ada}/settings`))
      throw new Error(`/settings went to ${page.url()}`);
    await page.getByRole('tablist', { name: 'Settings' }).waitFor();
    const shop = walk.kept.get('shop');
    const old =
      shop === undefined
        ? '/m/computer-1/p/nothing'
        : new URL(shop).pathname.replace(`/a/${ada}`, '');
    await walk.go(old);
    await placedUnder(walk, ada);
    if (!page.url().endsWith(`/a/${ada}${old}`))
      throw new Error(`${old} went to ${page.url()}`);
    await walk.shot('old-address-placed');

    walk.step('the Auth Worker slow: the kept Account drawn at once, Checking');
    await bubble.must('Sign-in', 'Make auth worker slow');
    await reload(walk, '/');
    await placedUnder(walk, ada);
    await page
      .getByRole('img', {
        name: `Checking who is signed in. Last signed in as ${ADA}`,
      })
      .first()
      .waitFor();
    await walk.see(STUDIO, page.getByRole('complementary'));
    await walk.shot('checking');
    await bubble.must('Sign-in', 'Bring auth worker back');
    await page
      .getByRole('button', { name: `Accounts. Signed in as ${ADA}` })
      .first()
      .waitFor();

    walk.step(
      'the Auth Worker out of reach: the kept Account works, nothing pruned',
    );
    const before = await databases(walk);
    await bubble.must('Sign-in', 'Put auth worker out of reach');
    await reload(walk, '/');
    await placedUnder(walk, ada);
    await until(walk, /Linked/);
    await page.waitForTimeout(2000);
    await page
      .getByRole('img', { name: /^Checking who is signed in/ })
      .first()
      .waitFor();
    const during = await databases(walk);
    if (ofAccount(during, ada).length < ofAccount(before, ada).length)
      throw new Error(`Pruned while out of reach: ${during.join(', ')}`);
    await walk.shot('auth-worker-out-of-reach');
    await bubble.must('Sign-in', 'Bring auth worker back');
    await reload(walk, '/');
    await page
      .getByRole('button', { name: `Accounts. Signed in as ${ADA}` })
      .first()
      .waitFor();

    walk.step('Add another account from the switcher: Grace, placed under her');
    await addAccount(walk, 'grace');
    await walk.see('No Connection yet');
    await walk.shot('grace-added');
    // Lab is the next computer added, whichever came before.
    const added = (await bubble.value('Computers', ['added'])) as number;
    const lab = `Computers/computers[computer-${added + 1}]`;
    // Above any Minimum Connect the walk set before.
    await bubble.must('Computers', 'Add computer', {
      name: 'Lab',
      keConnectVersion: '9.0.0',
      signedInAs: GRACE,
    });
    await bubble.close();
    await walk.button('Look again').click();
    await walk.see('Lab', page.getByRole('complementary'));
    await until(walk, /Lab[\s\S]*Linked/);
    // Grace's socket to Lab open; none to Ada's Studio.
    await sockets(walk, lab, someOpen, 'some');
    await sockets(walk, COMPUTER, noneOpen, 'none');
    await walk.shot('grace-lab');

    walk.step(
      'the switcher: Grace checked, Ada to switch to, Add, Sign out, all',
    );
    let menu = await switcher(walk);
    await walk.see('Signed in as', menu);
    await walk.see(GRACE, menu);
    await menu.getByRole('menuitem', { name: `Switch to ${ADA}` }).waitFor();
    await menu.getByRole('menuitem', { name: 'Add another account' }).waitFor();
    await menu
      .getByRole('menuitem', { name: `Sign out of ${GRACE}` })
      .waitFor();
    await menu
      .getByRole('menuitem', { name: 'Sign out of all accounts' })
      .waitFor();
    await walk.shot('switcher');

    walk.step('switch to Ada here: her home, Studio linked, Lab not hers');
    await menu.getByRole('menuitem', { name: `Switch to ${ADA}` }).click();
    await placedUnder(walk, ada);
    await until(walk, /Studio[\s\S]*Linked/);
    if ((await page.getByRole('complementary').innerText()).includes('Lab'))
      throw new Error("Ada's sidebar lists Grace's Lab");
    // Grace's socket closed, Ada's open.
    await sockets(walk, lab, noneOpen, 'none');
    await sockets(walk, COMPUTER, someOpen, 'some');
    await walk.shot('switched-to-ada');

    walk.step('the switcher on a phone: You, then Accounts, the same choices');
    const wide = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 844 });
    const you = page
      .getByRole('button', { name: 'You, theme and settings' })
      .filter({ visible: true })
      .first();
    if (!(await you.isVisible()))
      await page
        .getByRole('button', { name: 'Toggle sidebar' })
        .filter({ visible: true })
        .first()
        .click();
    await you.click();
    await page
      .getByRole('button', { name: new RegExp(`${ADA}.*Switch$`) })
      .filter({ visible: true })
      .first()
      .click();
    const list = page
      .getByRole('dialog', { name: 'Accounts' })
      .filter({ visible: true })
      .last();
    await list.waitFor();
    await list.getByRole('img', { name: 'Signed in' }).waitFor();
    await list.getByRole('button', { name: `Switch to ${GRACE}` }).waitFor();
    await list.getByRole('button', { name: 'Add another account' }).waitFor();
    await list.getByRole('button', { name: `Sign out of ${ADA}` }).waitFor();
    await list
      .getByRole('button', { name: 'Sign out of all accounts' })
      .waitFor();
    await walk.shot('switcher-touch');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.setViewportSize(wide);

    walk.step(
      'a guess corrected: placed under Ada while checking, Grace answered',
    );
    await bubble.must('Sign-in', 'Make auth worker slow');
    await reload(walk, '/');
    await placedUnder(walk, ada);
    await bubble.must('Sign-in', 'Switch account elsewhere', { email: GRACE });
    await bubble.must('Sign-in', 'Bring auth worker back');
    await placedUnder(walk, grace);
    await walk.see('Lab', page.getByRole('complementary'));
    await walk.shot('guess-corrected');

    walk.step("Away, switched elsewhere: choosing this page's Account stays");
    menu = await switcher(walk);
    await menu.getByRole('menuitem', { name: `Switch to ${ADA}` }).click();
    await placedUnder(walk, ada);
    await until(walk, /Studio[\s\S]*Linked/);
    await bubble.must('Sign-in', 'Switch account elsewhere', { email: GRACE });
    await bubble.close();
    await away(walk, `You switched to ${GRACE} elsewhere`);
    await walk.shot('away-switched');
    // Away, no socket open, Ada's or Grace's.
    await sockets(walk, COMPUTER, noneOpen, 'none');
    await sockets(walk, lab, noneOpen, 'none');
    await choose(walk, ADA);
    await until(walk, /Studio[\s\S]*Linked/);
    if (accountIn(walk) !== ada) throw new Error(`Moved to ${page.url()}`);
    // Active again: Ada's socket open again.
    await sockets(walk, COMPUTER, someOpen, 'some');

    walk.step('Away, another Account added elsewhere: says it was switched');
    await bubble.must('Sign-in', 'Add account elsewhere', {
      email: 'hal',
      name: 'Hal',
    });
    await bubble.close();
    await away(walk, `You switched to ${HAL} elsewhere`);
    await walk.shot('away-added');
    await choose(walk, ADA);
    await until(walk, /Studio[\s\S]*Linked/);

    walk.step('Away, a link for Grace, signed in here: choosing her stays');
    await walk.go(`/a/${grace}`);
    await away(walk, `This link is for ${GRACE}`);
    await walk.shot('away-link-other');
    await choose(walk, GRACE);
    await until(walk, /Lab[\s\S]*Linked/);
    if (accountIn(walk) !== grace) throw new Error(`Moved to ${page.url()}`);

    walk.step('choosing another Account on the Away screen goes to its home');
    await walk.go(`/a/${ada}/settings`);
    await away(walk, `This link is for ${ADA}`);
    await choose(walk, HAL);
    await placedUnder(walk, idOf(HAL));
    await walk.see('No Connection yet');
    await walk.shot('away-chose-another');

    walk.step('the browser full: five Accounts, the switcher says so');
    await addAccount(walk, 'ivy');
    await addAccount(walk, 'jo');
    menu = await switcher(walk);
    await walk.see(
      'This browser holds 5 accounts, the most it can. Sign out of one to add another.',
      menu,
    );
    await walk.shot('browser-full');

    walk.step('sign out of the Active Account here: Away, signed out');
    const jo = idOf('jo@kestack.test');
    await menu
      .getByRole('menuitem', { name: 'Sign out of jo@kestack.test' })
      .click();
    await away(walk, 'jo@kestack.test is signed out');
    await walk.shot('signed-out-here');

    walk.step('Away, signed out elsewhere: Ivy, from another tab');
    await choose(walk, 'ivy@kestack.test');
    await walk.see('No Connection yet');
    const ivy = idOf('ivy@kestack.test');
    const withIvy = await databases(walk);
    if (ofAccount(withIvy, ivy).length === 0)
      throw new Error(`Ivy has no database: ${withIvy.join(', ')}`);
    await bubble.must('Sign-in', 'Sign out elsewhere', {
      email: 'ivy@kestack.test',
    });
    await bubble.close();
    await away(walk, 'ivy@kestack.test is signed out');
    await walk.shot('away-signed-out-elsewhere');

    walk.step('prune: the Accounts signed out go, with their databases');
    await reload(walk, '/');
    await page.waitForTimeout(2000);
    const pruned = await databases(walk);
    console.log(`  databases: ${pruned.join(', ')}`);
    if (ofAccount(pruned, ivy).length > 0 || ofAccount(pruned, jo).length > 0)
      throw new Error(`Not pruned: ${pruned.join(', ')}`);
    if (ofAccount(pruned, ada).length === 0)
      throw new Error(`Ada pruned: ${pruned.join(', ')}`);

    walk.step(
      'a link for an Account not signed in here: signing in comes back',
    );
    const zoe = idOf('zoe@kestack.test');
    await walk.go(`/a/${zoe}/settings`);
    await away(walk, 'This link is for an Account not signed in here');
    await walk.shot('away-not-here');
    await page.getByText('Continue with Google').click();
    await asked(walk);
    await bubble.must('Sign-in', 'Sign in as', { email: 'zoe', name: 'Zoe' });
    await placedUnder(walk, zoe);
    await page.getByRole('tablist', { name: 'Settings' }).waitFor();
    await walk.shot('not-here-signed-in');

    walk.step('Sign out of all: the Sign-in Screen alone, every database gone');
    menu = await switcher(walk);
    await menu
      .getByRole('menuitem', { name: 'Sign out of all accounts' })
      .click();
    await walk.see('Continue with Google');
    await page.waitForTimeout(1000);
    const none = await databases(walk);
    console.log(`  databases: ${none.join(', ')}`);
    if (none.some((name) => name.startsWith('code:account:')))
      throw new Error(`Kept: ${none.join(', ')}`);
    await walk.shot('signed-out-of-all');

    walk.step('a sign-in abandoned: the screen stays, the button again');
    await page.getByText('Continue with Google').click();
    await asked(walk);
    await bubble.must('Sign-in', 'Cancel sign in');
    await bubble.close();
    await walk.see('Continue with Google');
    await walk.shot('sign-in-abandoned');

    walk.step('a sign-in fails: the app says why');
    await bubble.must('Sign-in', 'Fail next sign in', {
      reason: 'Google said no',
    });
    await bubble.close();
    await page.getByText('Continue with Google').click();
    await walk.see('Google said no', page.getByRole('alert'));
    await walk.shot('sign-in-failed');

    // The address is still Zoe's page: a sign-in comes back to it, and
    // Zoe is signed out, so Ada is offered there.
    walk.step("signed in as Ada again on Zoe's page: Away, then Ada's home");
    await page.getByText('Continue with Google').click();
    await asked(walk);
    await bubble.must('Sign-in', 'Sign in as', { email: 'ada', name: 'Ada' });
    await bubble.close();
    await away(walk, 'zoe@kestack.test is signed out');
    await choose(walk, ADA);
    await placedUnder(walk, ada);
    await until(walk, /Studio[\s\S]*Linked/);
    await walk.shot('ada-again');
  },
};
