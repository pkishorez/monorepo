import type { Page } from 'playwright-core';
import type { Walk } from '../walker.ts';
import type { Scenario } from './index.ts';

/*
 * A session on shop, over the Agent fake: the first message echoes; then
 * each Script the Agent fake's Reply with picks plays into the same
 * session, drawn by the real projection as production draws a real
 * harness's records. A question is answered in the app; a long reply is
 * stopped from the app.
 */

/** Types into the Draft showing and sends it, as Ctrl+Enter does. */
export const send = async (page: Page, text: string) => {
  const draft = page
    .getByRole('textbox', { name: /^(First message|Message)$/ })
    .filter({ visible: true })
    .first();
  await draft.click();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
};

/** Picks the Script the Agent fake plays for every reply from now on. */
export const replyWith = (walk: Walk, script: string) =>
  walk.bubble.must('Agent', 'Reply with', { script });

/** Waits for a Turn to end: its footer's "About this turn", the nth one. */
const turns = (walk: Walk) =>
  walk.page.getByRole('button', { name: /About this turn/ });

const turnEnded = async (walk: Walk, count: number) => {
  await turns(walk)
    .nth(count - 1)
    .waitFor({ timeout: 20_000 });
};

export const sessions: Scenario = {
  name: 'sessions',
  title: 'A session: echo, every Script, a question answered, Stop, signed out',
  needs: ['projects'],
  run: async (walk) => {
    const { page, bubble } = walk;
    let ended = 0;
    const play = async (script: string, prompt: string) => {
      await replyWith(walk, script);
      await bubble.close();
      await send(page, prompt);
    };

    walk.step('the first message starts a session; the Agent fake echoes it');
    await send(page, 'Say hello');
    await walk.see('echo: Say hello');
    await turnEnded(walk, ++ended);
    walk.kept.set('session', page.url());
    await walk.shot('echo');

    walk.step('words: Markdown, code and a link, after a thought');
    await play('words', 'Explain the store');
    await walk.see('What changes');
    await turnEnded(walk, ++ended);
    await walk.shot('words');

    walk.step(
      'every tool: read, search, edit, write, delete, bash, web, mcp, other',
    );
    await play('every tool', 'Add the index');
    await walk.see('Done: the store has its index and the tests pass.');
    await turnEnded(walk, ++ended);
    await walk.button(/^Read 2 files, searched once/).click();
    await walk.see('pnpm lint');
    await walk.shot('every-tool');

    walk.step('subagent: a helper that starts one of its own');
    await play('subagent', 'Find the failing tests');
    await walk.see('The helper found one failing test about order.');
    await turnEnded(walk, ++ended);
    await walk.shot('subagent');
    await walk.see('Check the tests');
    await walk.button(/^Open the subagent: Check the tests/).click();
    const helper = page.getByRole('dialog', { name: 'Check the tests' });
    await walk.see(
      'One test fails: it checks that rows keep their order.',
      helper,
    );
    await walk.shot('subagent-open');
    await walk
      .button(/^Open the subagent: Read the store test/, helper)
      .click();
    await walk.see('Line 40 checks that rows keep their order.');
    await walk.shot('subagent-nested');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await helper.waitFor({ state: 'detached' });

    walk.step('question: two Items, answered in the app');
    await play('question', 'Set up the store');
    const asks = page.getByRole('dialog', { name: 'Claude asks' });
    await asks.waitFor();
    await walk.shot('question');
    await asks.getByRole('radio', { name: /^SQLite/ }).click();
    await walk.button(/^Next/, asks).click();
    await walk.see('Which checks should run?', asks);
    await asks.getByRole('checkbox', { name: /^Tests/ }).click();
    await asks.getByRole('checkbox', { name: /^Types/ }).click();
    await walk.shot('question-second');
    await walk.button(/^Send/, asks).click();
    await asks.waitFor({ state: 'detached' });
    await turnEnded(walk, ++ended);
    await walk.see('SQLite');
    await walk.shot('question-answered');

    walk.step('background jobs: a dev server and a helper left running');
    await play('background jobs', 'Start the dev server');
    await walk.see('The dev server runs in the background');
    await turnEnded(walk, ++ended);
    await walk.shot('background-jobs');
    const devServer = String(await bubble.value('Agent', ['jobs', '0', 'id']));
    await bubble.must('Agent', 'Write job output', {
      job: devServer,
      text: 'GET / 200 in 12ms\n',
    });
    await bubble.close();
    await walk.button('1 subagent and 1 command running').click();
    const running = page.getByRole('dialog', { name: 'Running now' });
    await running
      .getByRole('option', { name: /^Watch the logs for errors/ })
      .waitFor();
    await walk.shot('running-picker');
    await running.getByRole('option', { name: /^pnpm dev/ }).click();
    const command = page.getByRole('dialog', { name: 'pnpm dev' });
    await walk.see('GET / 200 in 12ms', command);
    await walk.shot('running-command');
    await page.keyboard.press('Escape');
    await command.waitFor({ state: 'detached' });

    walk.step('the jobs end; Claude reports on its own');
    await bubble.must('Agent', 'End job', {
      job: '',
      how: 'done',
      summary: 'No errors in the logs',
    });
    await walk.see(
      'The background agent "Watch the logs for errors" finished.',
    );
    await turnEnded(walk, ++ended);
    await bubble.must('Agent', 'End job', {
      job: devServer,
      how: 'done',
      summary: 'Stopped the dev server',
    });
    await walk.see('The background command "pnpm dev" finished.');
    await turnEnded(walk, ++ended);
    await walk.shot('jobs-ended');

    walk.step('fails: works a little, then the harness fails');
    await play('fails', 'Run the migration');
    await walk.see('API Error: 529 Overloaded');
    await turnEnded(walk, ++ended);
    await walk.shot('fails');

    walk.step('cut off: the harness process exits mid-reply');
    await play('cut off', 'Refactor the store');
    await walk.see('Claude Code stopped with exit code 137');
    await turnEnded(walk, ++ended);
    await walk.shot('cut-off');

    walk.step('Stop a long reply from the app');
    await play('long', 'Write it all out');
    await walk.see('Part 2.');
    await walk.button('Stop').click();
    await walk.button(/^Stopped by you/).waitFor();
    await walk.shot('stopped');

    walk.step(
      "Claude signed out: a new session's Turn fails with its login error",
    );
    // A harness reads its login as it opens, as Claude Code does: the next
    // session's agent opens signed out.
    await bubble.must('Agent', 'Sign out', {
      harness: 'claude',
      configFolder: '',
    });
    await replyWith(walk, 'echo');
    await bubble.close();
    await page
      .getByRole('complementary')
      .getByRole('link', { name: /^shop .*New session$/ })
      .click();
    await send(page, 'Are you there?');
    await walk.see('Not logged in · Please run /login');
    await walk.shot('signed-out');
    await bubble.must('Agent', 'Sign in', {
      harness: 'claude',
      configFolder: '',
    });
  },
};
