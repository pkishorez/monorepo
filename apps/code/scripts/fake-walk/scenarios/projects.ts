import type { Scenario } from './index.ts';
import { COMPUTER } from './home.ts';

/** Studio's File System, in the bubble. */
export const DISK = `${COMPUTER}/fileSystem`;

/*
 * The Project Picker over Studio's File System: a sample project, a plain
 * folder and a hidden one made in the bubble; in the app, the folder Steps
 * from home, hidden folders only for a search starting with `.`, a search,
 * a folder made from the app (seen in the bubble's tree), then the sample
 * project chosen, its branches read from its repository.
 */
export const projects: Scenario = {
  name: 'projects',
  title: 'Project Picker over the File System, and branches',
  needs: ['home'],
  run: async (walk) => {
    const { page, bubble } = walk;
    walk.step('on Studio: a sample project, ~/notes, and a hidden ~/.secrets');
    await bubble.must(DISK, 'Add sample project', { folder: '~/code/shop' });
    await bubble.must(DISK, 'Add folder', { folder: '~/notes' });
    await bubble.must(DISK, 'Add hidden folder', { in: '~', name: 'secrets' });
    await bubble.close();

    walk.step('Open a folder: the Picker, then home');
    await walk.button(/Open a folder/).click();
    const picker = page.getByRole('dialog', { name: 'Open a project' });
    const search = picker.getByRole('combobox');
    await picker.getByRole('option', { name: /Open a folder/ }).click();
    await walk.see('code', picker.getByRole('listbox'));
    await walk.see('notes', picker.getByRole('listbox'));
    if ((await picker.getByRole('option', { name: '.secrets' }).count()) > 0)
      throw new Error('.secrets is listed without a search for it');
    await walk.shot('home-folders');

    walk.step('hidden folders: only for a search starting with "."');
    await search.fill('.');
    await picker.getByRole('option', { name: '.secrets' }).waitFor();
    await walk.shot('hidden-folders');

    walk.step('search: "no" leaves notes alone');
    await search.fill('no');
    await picker.getByRole('option', { name: 'notes', exact: true }).waitFor();
    await picker
      .getByRole('option', { name: 'code', exact: true })
      .waitFor({ state: 'detached' });
    await walk.shot('search');

    walk.step('into code, then make ~/code/newthing from the app');
    await search.fill('');
    await picker.getByRole('option', { name: 'code', exact: true }).click();
    await picker.getByRole('option', { name: 'shop', exact: true }).waitFor();
    await search.fill('newthing');
    await picker
      .getByRole('option', { name: /Create “newthing” here/ })
      .click();
    await walk.see('~/code/newthing');
    await walk.shot('newthing-project');
    const tree = await bubble.model(DISK, ['tree']);
    if (!tree.includes('/home/you/code/newthing'))
      throw new Error('~/code/newthing is not in the File System');
    await bubble.host
      .locator('span.k:text-is("/home/you/code/newthing:")')
      .scrollIntoViewIfNeeded();
    await walk.shot('newthing-in-bubble', { bubble: true });

    walk.step('Ctrl+P, look for code under home, go in, choose shop');
    await bubble.close();
    await page.keyboard.press('Control+p');
    await search.fill('code');
    await picker
      .getByRole('option', { name: /Look for “code” under home/ })
      .click();
    await picker.getByRole('option', { name: 'code', exact: true }).click();
    await picker
      .getByRole('option', { name: 'newthing', exact: true })
      .waitFor();
    await search.fill('shop');
    await picker.getByRole('option', { name: 'shop', exact: true }).waitFor();
    await walk.shot('choose-shop');
    await page.keyboard.press('Control+Enter');
    await walk.see('~/code/shop');
    walk.kept.set('shop', page.url());

    walk.step('shop is a git Project: its branch, and the Branch Picker');
    await walk.button('Branch: main').waitFor();
    await walk.see('tracks origin/main');
    await walk.shot('shop-project');
    await walk.button('Branch: main').click();
    const branches = page.getByRole('dialog', { name: 'Branch' });
    for (const branch of [
      /^main tracks origin\/main/,
      /^feature\/sign-in tracks/,
      /^fix\/typo/,
      /^origin\/release\/1\.0/,
    ])
      await branches.getByRole('option', { name: branch }).waitFor();
    await walk.shot('branch-picker');
    await page.keyboard.press('Escape');
    await branches.waitFor({ state: 'detached' });
  },
};
