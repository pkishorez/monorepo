import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe, sequence } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  nav { display: flex; gap: 8px; margin-bottom: 18px; }
  nav span { padding: 10px 22px; border-radius: 12px; background: #fff; border: 1px solid #e4e4e7; font-weight: 600; }
  nav span[aria-current="true"] { background: #18181b; color: #fff; border-color: #18181b; }
  .hint { width: 340px; padding: 14px 18px; background: #18181b; color: #fafafa; border-radius: 14px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); }
  .hint b { color: #fbbf24; }
  .hint ul { list-style: none; margin: 8px 0 0; padding: 0; }
  .hint li { display: flex; gap: 12px; align-items: center; padding: 4px 0; }
  .idle { color: #a1a1aa; }
`;

const keys = createKeys({
  surfaces: {
    mail: {
      actions: {
        inbox: { keys: [sequence('g i')], description: 'Go to Inbox' },
        sent: { keys: [sequence('g s')], description: 'Go to Sent' },
        drafts: { keys: [sequence('g d')], description: 'Go to Drafts' },
      },
    },
  },
});

function Hint() {
  const { sequence: under } = keys.useStatus();
  if (under.type === 'idle') {
    return (
      <p className="idle" id="hint">
        Press <kbd>g</kbd> to go somewhere
      </p>
    );
  }
  return (
    <div className="hint" id="hint">
      <b>{under.pressed.map(describe).join(' ')}</b> … then
      <ul>
        {under.next.map((option) => (
          <li key={option.id}>
            <kbd>{describe(option.step)}</kbd> {option.description}
          </li>
        ))}
      </ul>
    </div>
  );
}

const folders = ['Inbox', 'Sent', 'Drafts'] as const;

function Mail() {
  const [folder, setFolder] = useState<(typeof folders)[number]>('Inbox');
  keys.useAction('mail.inbox', () => setFolder('Inbox'));
  keys.useAction('mail.sent', () => setFolder('Sent'));
  keys.useAction('mail.drafts', () => setFolder('Drafts'));
  return (
    <main>
      <h1>Mail</h1>
      <p>
        After the first key of a Sequence, the app shows every way to finish it.
      </p>
      <nav>
        {folders.map((each) => (
          <span key={each} aria-current={each === folder}>
            {each}
          </span>
        ))}
      </nav>
      <Hint />
    </main>
  );
}

export default Proof.browser({
  title: 'After g, the app shows every way to finish the Sequence',
  description:
    "`useStatus().sequence` is `possible` after the first step, with the keys pressed and each next step and its Action's description. It goes back to idle once a Sequence commits.",
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <keys.Provider surface="mail" sequence={{ timeout: 2000 }}>
        <style>{css}</style>
        <Mail />
      </keys.Provider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'no Sequence is under way, and the Inbox is open',
        (yield* tab.count('.hint')) === 0 &&
          (yield* tab.text('nav [aria-current="true"]')) === 'Inbox',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Press g', 'g');
      const options = yield* tab.evaluate(() =>
        [...document.querySelectorAll('.hint li')].map(
          (item) => item.textContent,
        ),
      );
      yield* tab.press('Finish with s', 's');
      return {
        options,
        folder: yield* tab.text('nav [aria-current="true"]'),
        hintAfter: yield* tab.count('.hint'),
      };
    }),
  verify: ({ options, folder, hintAfter }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'after g, the hint offered i, s and d with their Actions',
        JSON.stringify(options) ===
          JSON.stringify(['i Go to Inbox', 's Go to Sent', 'd Go to Drafts']),
      );
      yield* Proof.assert('s went to Sent', folder === 'Sent');
      yield* Proof.assert('the hint went away', hintAfter === 0);
    }),
});
