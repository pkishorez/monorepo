import type { Walk } from '../walker.ts';
import { COMPUTER } from './home.ts';
import type { Scenario } from './index.ts';
import { DISK } from './projects.ts';
import { replyWith, send } from './sessions.ts';

/*
 * The Project Picker and its folder Steps over Studio's File System, made
 * in the bubble: a folder of 120 folders, symlinks inside home (one to
 * shop) and out of it, a file in the way, folders unreadable, failing to
 * list and slow to list. Recent Projects by when each was active; a Project
 * picked opens its new session's page. In the folder Steps: in and out by
 * every key and button, a path typed, a listing cut short and asked again,
 * a symlink gone into and chosen, each refusal and error said in the
 * Step. Then newthing's folder goes: the Picker, open, shows it missing
 * once the Folder Check finds it (within its minute); back again, its page
 * starts Sessions; gone again, it is removed from its page, its Saved
 * Draft with it, its folder untouched.
 */

/** The Folder Check looks every minute. */
const FOLDER_CHECK = 70_000;

const pickerOf = (walk: Walk) =>
  walk.page.getByRole('dialog', { name: 'Open a project' });

/** The Picker's rows, each by its first line. */
const rows = async (walk: Walk) =>
  (await pickerOf(walk).getByRole('option').allInnerTexts()).map(
    (row) => row.split('\n')[0],
  );

/** The Picker's whole text on one line, for the log. */
const said = async (walk: Walk) =>
  (await pickerOf(walk).innerText()).replace(/\s*\n\s*/g, ' | ');

/** Ctrl+P, then Open a folder…: home's folders. */
const openFolders = async (walk: Walk) => {
  const picker = pickerOf(walk);
  await walk.bubble.close();
  await walk.page.keyboard.press('Control+p');
  await picker.getByRole('option', { name: /Open a folder/ }).click();
  await picker.getByRole('option', { name: 'notes', exact: true }).waitFor();
};

/** Types into the folder Step's search; waits until the Step says `expected`. */
const typed = async (walk: Walk, query: string, expected: RegExp) => {
  const picker = pickerOf(walk);
  await picker.getByRole('combobox').fill(query);
  const now = await walk.says(picker, expected);
  console.log(`  "${query}": ${now.replace(/\s*\n\s*/g, ' | ').slice(0, 160)}`);
};

/** Whether a Saved Draft on this device holds `text`, in any of the tab's databases. */
const savedDraftHolds = (walk: Walk, text: string) =>
  walk.page.evaluate(async (needle) => {
    for (const { name } of await indexedDB.databases()) {
      if (name === undefined) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const opening = indexedDB.open(name);
        opening.onsuccess = () => resolve(opening.result);
        opening.onerror = () => reject(opening.error);
      });
      try {
        for (const store of Array.from(db.objectStoreNames)) {
          if (store !== 'drafts') continue;
          const all = await new Promise<Array<unknown>>((resolve) => {
            const reading = db.transaction(store).objectStore(store).getAll();
            reading.onsuccess = () => resolve(reading.result);
            reading.onerror = () => resolve([]);
          });
          if (all.some((value) => JSON.stringify(value).includes(needle)))
            return true;
        }
      } finally {
        db.close();
      }
    }
    return false;
  }, text);

export const folders: Scenario = {
  name: 'folders',
  title: 'Project Picker: recent, folder Steps, refusals, missing, removed',
  needs: ['projects'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const picker = pickerOf(walk);
    const search = picker.getByRole('combobox');
    const sidebar = page.getByRole('complementary');

    walk.step('on Studio: many folders, symlinks, a file, folders that fail');
    await bubble.must(DISK, 'Add many folders', { in: '~/many', count: 120 });
    await bubble.must(DISK, 'Add symlink', { at: '~/work', to: '~/code' });
    await bubble.must(DISK, 'Add symlink', {
      at: '~/shop-link',
      to: '~/code/shop',
    });
    await bubble.must(DISK, 'Add folder', { folder: '/etc' });
    await bubble.must(DISK, 'Add symlink', { at: '~/system', to: '/etc' });
    await bubble.must(DISK, 'Add file', { file: '~/code/README', text: 'Hi' });
    for (const [folder, how] of [
      ['~/locked', 'Make unreadable'],
      ['~/broken', 'Make fail to list'],
      ['~/mounted', 'Make slow to list'],
    ] as const) {
      await bubble.must(DISK, 'Add folder', { folder });
      await bubble.must(DISK, how, { folder });
    }
    await replyWith(walk, 'echo');

    walk.step('Recent Projects, the latest active first');
    await walk.go(walk.kept.get('shop')!);
    await walk.button(/^Branch: /).waitFor();
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^shop/ }).waitFor();
    const first = await rows(walk);
    console.log(`  recent: ${first.join(', ')}`);
    await page.keyboard.press('Escape');
    // Another device starts a session in newthing: it is the latest now.
    await bubble.must(COMPUTER, 'Start session elsewhere', {
      project: '~/code/newthing',
      text: 'From the phone',
    });
    await bubble.close();
    await sidebar.getByText('From the phone').waitFor();
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^newthing/ }).waitFor();
    const recent = await rows(walk);
    console.log(`  recent: ${recent.join(', ')}`);
    if (recent[0] !== 'newthing' || recent[1] !== 'shop')
      throw new Error(`Recent is ${recent.join(', ')}, not newthing, shop`);
    await walk.shot('recent');

    walk.step("pick a Project: its new session's page opens");
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await picker.waitFor({ state: 'detached' });
    await walk.see('~/code/shop', walk.main);
    // Production note: from a page whose Draft held the keyboard it goes
    // back to the Draft; otherwise, Vim Mode off, it is on the page.
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ??
        document.activeElement?.localName,
    );
    console.log(`  the keyboard is in: ${focused}`);
    await walk.shot('picked');

    walk.step(
      'folder Steps: in by Enter, Ctrl+L and a click; out by Ctrl+H, Backspace and Back',
    );
    await openFolders(walk);
    await search.fill('code');
    await page.keyboard.press('Enter');
    await picker.getByRole('option', { name: 'shop', exact: true }).waitFor();
    await page.keyboard.press('Control+h');
    // Back, the search typed there comes back with it.
    await picker.getByRole('option', { name: 'code', exact: true }).waitFor();
    if ((await search.inputValue()) !== 'code')
      throw new Error('Ctrl+H did not bring back the search "code"');
    await search.fill('many');
    await page.keyboard.press('Control+l');
    await picker
      .getByRole('option', { name: 'folder-001', exact: true })
      .waitFor();

    walk.step(
      'a folder of 120 folders: 100 listed, the rest asked for by a search',
    );
    const listed = await rows(walk);
    if (listed.length !== 100 || listed.at(-1) !== 'folder-100')
      throw new Error(`many lists ${listed.length}, up to ${listed.at(-1)}`);
    await walk.shot('many-cut-short');
    await search.fill('folder-11');
    await picker
      .getByRole('option', { name: 'folder-119', exact: true })
      .waitFor();
    console.log(`  folder-11: ${(await rows(walk)).join(', ')}`);
    await walk.shot('many-searched');
    await search.fill('');
    await page.keyboard.press('Backspace');
    await picker.getByRole('option', { name: 'many', exact: true }).waitFor();
    await search.fill('');
    await picker.getByRole('option', { name: /^code/ }).click();
    await picker.getByRole('option', { name: 'shop', exact: true }).waitFor();
    await walk.button('Back', picker).click();
    await picker.getByRole('option', { name: 'notes', exact: true }).waitFor();

    walk.step('a path typed goes to its folder and searches the rest');
    await typed(walk, '~/code/sh', /code[\s\S]*shop/);
    await walk.shot('typed-path');

    walk.step(
      'symlinks: one inside home listed and gone into; one out of it not listed',
    );
    await search.fill('');
    await walk.button('Back', picker).click();
    await search.fill('');
    await picker.getByRole('option', { name: /^work/ }).waitFor();
    if (!(await rows(walk)).includes('shop-link'))
      throw new Error('~/shop-link is not listed');
    if ((await rows(walk)).includes('system'))
      throw new Error('~/system, out of home, is listed');
    await walk.shot('symlinks-listed');
    await picker.getByRole('option', { name: /^work/ }).click();
    await picker.getByRole('option', { name: 'shop', exact: true }).waitFor();
    await walk.shot('symlink-in');
    await walk.button('Back', picker).click();

    walk.step('create refused: a file of that name; a name no folder can have');
    await search.fill('~/code/README');
    await picker.getByRole('option', { name: /Create “README” here/ }).click();
    await walk.see('Something is already at /home/you/code/README', picker);
    await walk.shot('create-taken');
    await search.fill('..');
    await picker.getByRole('option', { name: /Create “\.\.” here/ }).click();
    await walk.see(/\.\. cannot be a folder's name/, picker);
    await walk.shot('create-bad-name');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await picker.waitFor({ state: 'detached' });

    walk.step('folder errors, each said in the Step');
    await openFolders(walk);
    await typed(walk, '~/nowhere/x', /No folder at \/home\/you\/nowhere/);
    await walk.shot('no-folder');
    await typed(walk, '~/locked/', /Not allowed to open \/home\/you\/locked/);
    await walk.shot('unreadable');
    await typed(walk, '~/system/', /\/etc is outside your home folder/);
    await walk.shot('outside-home');
    await typed(walk, '~/broken/', /Could not read \/home\/you\/broken: EIO/);
    await walk.shot('fails-to-list');
    await typed(
      walk,
      '~/mounted/',
      /Could not read \/home\/you\/mounted: Listing it took too long/,
    );
    await walk.shot('slow-to-list');
    // From `/` a path names no folder by home: it is searched for, and
    // `..` goes up no further than home.
    await typed(walk, '~/', /broken[\s\S]*notes/);
    await typed(walk, '/etc', /No folder by that name/);
    await typed(walk, '../', /broken[\s\S]*notes/);
    console.log(`  the Step: ${(await said(walk)).slice(0, 120)}`);

    walk.step(
      'choose a symlink to shop, then shop itself: shop opens, no second',
    );
    await search.fill('shop-link');
    await picker.getByRole('option', { name: /^shop-link/ }).waitFor();
    await page.keyboard.press('Control+Enter');
    await picker.waitFor({ state: 'detached' });
    await page.waitForURL(walk.kept.get('shop')!);
    await openFolders(walk);
    await search.fill('~/code/shop');
    await picker.getByRole('option', { name: 'shop', exact: true }).waitFor();
    await page.keyboard.press('Control+Enter');
    await picker.waitFor({ state: 'detached' });
    await page.waitForURL(walk.kept.get('shop')!);
    await walk.shot('symlink-chosen');
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^shop/ }).waitFor();
    const projects = await rows(walk);
    if (projects.filter((row) => row === 'shop').length !== 1)
      throw new Error(`The Picker lists ${projects.join(', ')}`);
    await page.keyboard.press('Escape');

    walk.step("newthing's folder goes: the Picker, open, shows it missing");
    await bubble.must(DISK, 'Remove folder', { folder: '~/code/newthing' });
    await bubble.close();
    await page.keyboard.press('Control+p');
    const started = Date.now();
    await picker
      .getByText('Folder missing · ~/code/newthing')
      .waitFor({ timeout: FOLDER_CHECK });
    console.log(`  missing after ${Date.now() - started} ms, the Picker open`);
    const missing = picker.getByRole('option', { name: /^newthing/ });
    if ((await missing.getAttribute('aria-disabled')) !== 'true')
      throw new Error('newthing can be chosen, its folder missing');
    await missing.click({ force: true });
    if ((await picker.count()) === 0)
      throw new Error('newthing, missing, was chosen');
    await walk.shot('missing');
    await page.keyboard.press('Escape');

    walk.step('back again: choosable, and its page starts a session');
    await bubble.must(DISK, 'Put folder back', { folder: '~/code/newthing' });
    await bubble.close();
    await page.keyboard.press('Control+p');
    const back = picker.getByRole('option', { name: /^newthing/ });
    for (const start = Date.now(); ;) {
      if ((await back.getAttribute('aria-disabled')) === 'false') break;
      if (Date.now() - start > FOLDER_CHECK)
        throw new Error('newthing never came back in the Picker');
      await page.waitForTimeout(500);
    }
    await walk.shot('back-choosable');
    await back.click();
    await walk.button('Remove project').waitFor({ state: 'detached' });
    await send(page, 'Hello again');
    await walk.see('echo: Hello again');
    await walk.shot('back-again');

    walk.step('gone again: Remove, asked first, from its own page');
    await sidebar
      .getByRole('link', { name: /^newthing .*New session$/ })
      .click();
    const draft = 'A draft that goes with it';
    await page
      .getByRole('textbox', { name: /^(First message|Message)$/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.keyboard.type(draft);
    for (let tries = 0; !(await savedDraftHolds(walk, draft)); tries += 1) {
      if (tries > 20) throw new Error('The Draft was never saved');
      await page.waitForTimeout(250);
    }
    await bubble.must(DISK, 'Remove folder', { folder: '~/code/newthing' });
    await bubble.close();
    await walk.button('Remove project').waitFor({ timeout: FOLDER_CHECK });
    await walk.see(/no longer exists/, walk.main);
    await walk.shot('missing-page');
    await walk.button('Remove project').click();
    const asked = page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog'))
      .filter({ hasText: 'Remove newthing?' });
    await asked.waitFor();
    await walk.shot('remove-asked');
    await walk.button('Remove project', asked).click();
    await asked.waitFor({ state: 'detached' });
    await walk.see('Projects', walk.main);
    await sidebar
      .getByRole('link', { name: /^newthing/ })
      .first()
      .waitFor({ state: 'detached' });
    if ((await walk.main.innerText()).includes('newthing'))
      throw new Error('Home still lists newthing');
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^shop/ }).waitFor();
    if ((await rows(walk)).includes('newthing'))
      throw new Error('The Picker still lists newthing');
    await page.keyboard.press('Escape');
    if (await savedDraftHolds(walk, draft))
      throw new Error("newthing's Saved Draft is kept");
    const tree = await bubble.model(DISK, ['putAway']);
    if (!tree.includes('/home/you/code/newthing'))
      throw new Error("newthing's folder was touched");
    await walk.shot('removed');
    await bubble.must(DISK, 'Put folder back', { folder: '~/code/newthing' });
  },
};
