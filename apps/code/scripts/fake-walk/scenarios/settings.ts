import type { Locator } from 'playwright-core';
import { STUDIO } from './home.ts';
import type { Scenario } from './index.ts';
import { DISK } from './projects.ts';

/*
 * Settings → Connections, Studio's card: renamed, a rename refused while
 * Connect Cloud is out of reach; a second computer forgotten (dismissed
 * first), its Heartbeat told so. The agents card as the Agent fake has
 * them: Claude uninstalled and back, a second Claude login added and
 * removed. The Speech to Text switch: the model downloading as the Speech
 * fake lets it, failing, then Ready.
 */

export const settings: Scenario = {
  name: 'settings',
  title: "Settings: the Connection's card, agents, Speech to Text",
  needs: ['home'],
  run: async (walk) => {
    const { page, bubble } = walk;
    await bubble.close();
    // Settings may be open already, as the Outdated pill leaves it.
    if ((await page.getByRole('tablist', { name: 'Settings' }).count()) === 0)
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Connections' }).click();
    const card: Locator = walk.main
      .getByRole('region', { name: 'Connections' })
      .locator('ul > li')
      .first();
    await walk.see(STUDIO, card);
    await walk.shot('card');

    walk.step('rename Studio: pencil, type, Enter');
    await walk.button(`Rename ${STUDIO}`).click();
    await card
      .getByRole('textbox', { name: 'Display Name' })
      .fill('Studio Mac');
    await walk.shot('renaming');
    await page.keyboard.press('Enter');
    await walk.see('Studio Mac', card.getByRole('heading', { level: 3 }));
    await walk.see('Studio Mac', page.getByRole('complementary'));
    await walk.shot('renamed');

    walk.step('a rename while Connect Cloud is out of reach is refused');
    await bubble.must('Computers', 'Put cloud out of reach');
    await bubble.close();
    await walk.button('Rename Studio Mac').click();
    await card.getByRole('textbox', { name: 'Display Name' }).fill('Studio X');
    await page.keyboard.press('Enter');
    await walk.see(/Connect Cloud is out of reach/, card.getByRole('alert'));
    await walk.shot('rename-refused');
    await walk.button('Cancel', card).click();
    await bubble.must('Computers', 'Bring cloud back');

    walk.step(
      'another computer, Spare, forgotten: dismissed first, then confirmed',
    );
    // A ke-connect new enough for any Minimum Connect an earlier scenario set:
    // one below it is refused its first Heartbeat, so never listed.
    await bubble.must('Computers', 'Add computer', {
      name: 'Spare',
      keConnectVersion: '9.0.0',
      signedInAs: 'ada@kestack.test',
    });
    await bubble.close();
    await walk.button('Reload').click();
    await walk.button('Forget Spare').click();
    const asks = page.getByRole('alertdialog', { name: 'Forget Spare?' });
    await walk.see('Online · Tunnel working', asks);
    await walk.shot('forget-asks');
    await walk.button('Keep it', asks).click();
    await asks.waitFor({ state: 'detached' });
    await walk.button('Forget Spare').click();
    await walk.button('Forget', asks).click();
    await walk.button('Forget Spare').waitFor({ state: 'detached' });
    await walk.shot('forgotten');
    // Its next Heartbeat is told so, and it stops.
    const spare = 'Computers/computers[computer-2]';
    for (let tries = 0; ; tries += 1) {
      const stopped = await bubble.model(spare, ['stopped']);
      if (stopped.includes('Forgotten')) {
        console.log(`  Spare: ${stopped.replace(/\s+/g, ' ')}`);
        break;
      }
      if (tries > 40) throw new Error(`Spare was never told: ${stopped}`);
      await page.waitForTimeout(500);
    }
    await walk.shot('spare-stopped', { bubble: true });

    walk.step('agents: Claude uninstalled, then installed again');
    await bubble.must('Agent', 'Uninstall', {
      harness: 'claude',
      why: 'Removed by hand',
    });
    await bubble.close();
    // A Setup is asked as the Connection links, and again on Reload.
    await walk.button('Reload').click();
    const claude = card.getByRole('region', { name: 'Claude' });
    await walk.see('Removed by hand', claude);
    await walk.shot('claude-uninstalled');
    await bubble.must('Agent', 'Install', { harness: 'claude', version: '' });
    await bubble.close();
    await walk.button('Reload').click();
    await walk.says(claude, /\.claude\s+· \d/);
    await walk.shot('claude-installed');

    walk.step(
      'a second Claude login: its folder made, signed in, added, removed',
    );
    await bubble.must(DISK, 'Add folder', { folder: '~/.claude-work' });
    await bubble.must('Agent', 'Sign in', {
      harness: 'claude',
      configFolder: '~/.claude-work',
    });
    await bubble.close();
    await walk.button('Add Claude account', claude).click();
    await claude.getByRole('textbox', { name: 'Name' }).fill('Work');
    await claude
      .getByRole('textbox', { name: 'Config folder' })
      .fill('~/.claude-work');
    await walk.shot('add-account');
    await walk.button('Add account', claude).click();
    await walk.button('Work', claude).waitFor();
    await walk.says(claude, /Work[\s\S]*\.claude-work/);
    await walk.shot('account-added');
    await walk.button('Work', claude).click();
    await walk.button('Remove…', claude).click();
    const sure = claude.getByRole('group', { name: 'Remove Work?' });
    await walk.shot('account-remove');
    await walk.button('Remove', sure).click();
    await walk.button('Work', claude).waitFor({ state: 'detached' });
    await walk.shot('account-removed');

    walk.step(
      'Speech to Text: on, downloading as the Speech fake lets it, failed, then Ready',
    );
    await bubble.must('Speech', 'Hold downloads');
    await bubble.close();
    const speech = card.getByRole('region', { name: 'Speech to Text' });
    await speech.getByRole('switch').check();
    await walk.see('Downloading the model, 0 MB', speech);
    await bubble.must('Speech', 'Download to', { percent: 40 });
    await walk.see('Downloading the model, 201 MB of 503 MB', speech);
    await walk.shot('speech-downloading');
    await bubble.must('Speech', 'Fail download', {
      reason: 'No space left on device',
    });
    await walk.see("Couldn't set it up: No space left on device", speech);
    await walk.shot('speech-failed');
    await bubble.must('Speech', 'Let downloads run');
    await bubble.close();
    await walk.button('Try again', speech).click();
    await walk.says(speech, /Ready · ctrl\+Space dictates anywhere/, 30_000);
    await walk.shot('speech-ready');
  },
};
