import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe } from '@kestack/use-keys';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  mail: {
    actions: {
      inbox: { keys: 'g i', label: 'Go to Inbox' },
      sent: { keys: 'g s', label: 'Go to Sent' },
      drafts: { keys: 'g d', label: 'Go to Drafts' },
    },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; outline: none; }
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

function Hint() {
  const { pending } = keys.useKeyboard();
  const actions = keys.useAvailableActions();
  if (pending === null) {
    return (
      <p className="idle" id="hint">
        Press <kbd>g</kbd> to go somewhere
      </p>
    );
  }
  const next = actions.flatMap((action) =>
    action.keys
      .map(describe)
      .filter((keys) => keys.startsWith(`${pending} `))
      .map((keys) => ({
        step: keys.slice(pending.length + 1),
        label: action.label,
      })),
  );
  return (
    <div className="hint" id="hint">
      <b>{pending}</b> … then
      <ul>
        {next.map((option) => (
          <li key={option.step}>
            <kbd>{option.step}</kbd> {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const folders = ['Inbox', 'Sent', 'Drafts'] as const;

function Folders() {
  const [folder, setFolder] = useState<(typeof folders)[number]>('Inbox');
  keys.useAction('mail.inbox', () => setFolder('Inbox'));
  keys.useAction('mail.sent', () => setFolder('Sent'));
  keys.useAction('mail.drafts', () => setFolder('Drafts'));
  return (
    <nav>
      {folders.map((each) => (
        <span key={each} aria-current={each === folder}>
          {each}
        </span>
      ))}
    </nav>
  );
}

export default Proof.browser({
  title: 'After g, the app shows every way to finish the Sequence',
  description:
    '`useKeyboard().pending` is the Sequence under way, "g" after the first key, and null once it finishes. With the keys from `useAvailableActions`, the hint lists each next step and its Action.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <keys.Provider vim timing={{ sequence: 2000 }}>
        <style>{css}</style>
        <keys.Surface id="mail" asChild>
          <main>
            <h1>Mail</h1>
            <p>
              After the first key of a Sequence, the app shows every way to
              finish it.
            </p>
            <Folders />
            <Hint />
          </main>
        </keys.Surface>
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
