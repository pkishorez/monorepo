import type { Walk } from '../walker.ts';
import { until } from './computers.ts';
import type { Scenario } from './index.ts';
import { send } from './sessions.ts';
import { addComputer, drawer } from './tunnels.ts';

/*
 * Projects over two computers: Den added beside Studio, with its own
 * Project. The Project Picker opens on the Connection Step while the
 * sidebar shows every Connection, and on one Connection's Projects while
 * it shows that one; home lists every Project with its Connection. Den out
 * of reach: its Projects as kept in the Picker, its folder Step saying why;
 * its Project's page as kept, a send held until it is back; its branches,
 * not read meanwhile, read once it is, the picks standing as saved across a
 * reload. Den forgotten on another device: its Project's old link says so.
 */

const pickerOf = (walk: Walk) =>
  walk.page.getByRole('dialog', { name: 'Open a project' });

/** The header of a Project's page, where its Connection's standing shows. */
const headerSays = (walk: Walk, said: RegExp, timeout = 30_000) =>
  walk.says(walk.page.locator('header').first(), said, timeout);

export const reach: Scenario = {
  name: 'reach',
  title: 'Projects on two computers, one out of reach, one forgotten',
  needs: ['projects'],
  run: async (walk) => {
    const { page, bubble } = walk;
    const picker = pickerOf(walk);
    await until(walk, /Linked/);

    walk.step('Den, a second computer, with a sample project');
    const den = await addComputer(walk, 'Den');
    await bubble.must(`${den}/fileSystem`, 'Add sample project', {
      folder: '~/code/api',
    });
    await bubble.close();
    // With every Link up Code asks Connect Cloud nothing: a reload asks.
    await page.reload();
    await walk.button('Choose whose sessions to show').waitFor();

    walk.step('the Connection Step, with every Connection shown');
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^Den/ }).waitFor();
    const connections = (await picker.innerText()).replace(/\s*\n\s*/g, ' | ');
    console.log(`  ${connections.slice(0, 120)}`);
    if (!/Studio \| \d+ projects? \| Den \| 0 projects/.test(connections))
      throw new Error('The Connection Step does not list Studio and Den');
    await walk.shot('connection-step');
    await picker.getByRole('option', { name: /^Den/ }).click();
    await picker.getByRole('option', { name: /Open a folder/ }).click();
    await picker.getByRole('combobox').fill('~/code/api');
    await picker.getByRole('option', { name: 'api', exact: true }).waitFor();
    await page.keyboard.press('Control+Enter');
    await walk.see('~/code/api');
    const api = page.url();

    walk.step('the sidebar shows Den alone: no Connection Step');
    await drawer(walk, 'drawer-den', 'Den');
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^api/ }).waitFor();
    if ((await picker.getByRole('option', { name: /^Studio/ }).count()) > 0)
      throw new Error('The Connection Step shows with Den chosen');
    await walk.shot('den-projects');
    await page.keyboard.press('Escape');
    await drawer(walk, 'drawer-all', 'All Connections');

    walk.step('home: every Project, its Connection and path');
    await walk.go('/');
    await walk.says(
      walk.main,
      /api\s+Den\s+\/home\/you\/code\/api[\s\S]*shop\s+Studio\s+\/home\/you\/code\/shop/,
    );
    await walk.shot('home-two');

    walk.step(
      'Den out of reach: the Picker keeps its Projects, its folder Step says why',
    );
    await bubble.must(den, 'Go offline', { downAtOnce: true });
    await bubble.close();
    await page.keyboard.press('Control+p');
    await picker.getByRole('option', { name: /^Den/ }).click();
    await picker.getByRole('option', { name: /^api/ }).waitFor();
    await walk.shot('picker-den-down');
    await picker.getByRole('option', { name: /Open a folder/ }).click();
    await walk.see('The Connection could not be reached', picker);
    await walk.shot('folder-step-den-down');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    walk.step("Den's Project page while out of reach: as kept, a send held");
    await walk.go(api);
    await headerSays(walk, /Connection down/);
    await walk.see('You can start once it is back', walk.main);
    await send(page, 'Wait for Den');
    await page.waitForTimeout(1_000);
    if (page.url() !== api) throw new Error('A send went while Den was down');
    await walk.see('Wait for Den', walk.main);
    await walk.shot('api-den-down');

    walk.step(
      'back: its branches read; the picks stand as saved across a reload',
    );
    await bubble.must(den, 'Come online');
    await bubble.close();
    await walk.button(/^Branch: /).waitFor({ timeout: 30_000 });
    await walk.shot('api-branches-read');
    await walk.button(/^Branch: /).click();
    const branches = page.getByRole('dialog', { name: 'Branch' });
    await branches.getByRole('option', { name: /^fix\/typo/ }).click();
    await branches.waitFor({ state: 'detached' });
    await page.getByRole('switch', { name: 'New worktree' }).click();
    await page.waitForTimeout(1_000);
    await bubble.must(den, 'Go offline', { downAtOnce: true });
    await bubble.close();
    await page.waitForTimeout(500);
    await page.reload();
    await walk.see('Wait for Den', walk.main);
    await headerSays(walk, /Connection down/);
    if ((await walk.button(/^Branch: /).count()) > 0)
      throw new Error('Branches shown while Den is down');
    await bubble.must(den, 'Come online');
    await bubble.close();
    await walk.button('Branch: fix/typo').waitFor({ timeout: 30_000 });
    if (
      (await page
        .getByRole('switch', { name: 'New worktree' })
        .getAttribute('aria-checked')) !== 'true'
    )
      throw new Error('New Worktree did not stand as saved');
    await walk.shot('picks-stand');

    walk.step('Den forgotten on another device: its old link says so');
    await bubble.must(den, 'Forget elsewhere');
    await bubble.close();
    await page.waitForTimeout(500);
    await walk.go('/');
    await walk
      .button('Choose whose sessions to show')
      .waitFor({ state: 'detached', timeout: 30_000 });
    await walk.go(api);
    await walk.see(/This Connection is not one of yours any more/, walk.main);
    await walk.shot('connection-gone');
    await walk.go('/');
  },
};
