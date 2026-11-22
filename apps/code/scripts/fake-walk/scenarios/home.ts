import type { Scenario } from './index.ts';

/** The computer every later scenario uses, as Connect Cloud lists it. */
export const STUDIO = 'Studio';
export const COMPUTER = 'Computers/computers[computer-1]';

/*
 * Signed in through the bubble, home has no Connection; a computer added
 * in the bubble shows up once the list is asked again. With nothing
 * listed, Code asks Connect Cloud nothing more by itself (`recheckIn` is
 * null, as in production), so Look again asks.
 */
export const home: Scenario = {
  name: 'home',
  title: 'Sign in, no Connection, a computer added shows up',
  needs: [],
  run: async (walk) => {
    const { page, bubble } = walk;
    walk.step('open the app, signed out');
    await walk.go('/');
    await walk.see('Continue with Google');
    await walk.shot('signed-out');

    walk.step('Continue with Google; the bubble answers as Ada');
    await page.getByText('Continue with Google').click();
    await bubble.must('Sign-in', 'Sign in as', { email: 'ada', name: 'Ada' });
    await walk.see('No Connection yet');
    walk.kept.set('account', new URL(page.url()).pathname.split('/')[2]!);
    await walk.shot('home-no-connection');

    walk.step('add a computer, Studio, signed in as Ada');
    await bubble.must('Computers', 'Add computer', {
      name: STUDIO,
      signedInAs: 'ada@kestack.test',
    });
    await walk.shot('computer-added', { bubble: true });

    walk.step('Look again: Studio is listed and links');
    await walk.button('Look again').click();
    await walk.see(STUDIO);
    await walk.gone('No Connection yet');
    await walk.see('Open a folder to start a project', walk.main);
    await walk.shot('computer-listed');
  },
};
