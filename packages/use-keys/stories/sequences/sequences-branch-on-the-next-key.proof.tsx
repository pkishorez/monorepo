import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useSequence } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 48px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  nav { display: flex; gap: 8px; margin-bottom: 20px; }
  nav span { padding: 10px 22px; border-radius: 12px; background: #fff; border: 1px solid #e4e4e7; font-weight: 600; }
  nav span[aria-current="true"] { background: #18181b; color: #fff; border-color: #18181b; }
  h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; margin: 0 0 8px; }
  ol { margin: 0; padding: 8px 8px 8px 44px; min-height: 60px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  ol li { padding: 4px 8px; font: 500 16px ui-sans-serif, system-ui, sans-serif; }
`;

const folders = ['Inbox', 'Sent', 'Drafts'] as const;

function Mail() {
  const [folder, setFolder] = useState<(typeof folders)[number]>('Inbox');
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const write = (line: string) => setLog((now) => [...now, line]);
  const go = (keys: string, to: (typeof folders)[number]) => ({
    onCommit: () => {
      setFolder(to);
      write(`${keys}: went to ${to}`);
    },
    onCancel: (reason: string) =>
      write(`${keys}: cancelled, ${reason === 'key' ? 'wrong key' : reason}`),
  });
  const inbox = go('g i', 'Inbox');
  const sent = go('g s', 'Sent');
  const drafts = go('g d', 'Drafts');
  useSequence('g i', inbox.onCommit, inbox);
  useSequence('g s', sent.onCommit, sent);
  useSequence('g d', drafts.onCommit, drafts);
  return (
    <main>
      <h1>Mail</h1>
      <p>
        <kbd>g</kbd> then <kbd>i</kbd>, <kbd>s</kbd> or <kbd>d</kbd> goes to
        Inbox, Sent or Drafts
      </p>
      <nav>
        {folders.map((each) => (
          <span key={each} aria-current={each === folder}>
            {each}
          </span>
        ))}
      </nav>
      <h2>Sequence log</h2>
      <ol>
        {log.map((line, index) => (
          <li key={index} className="log">
            {line}
          </li>
        ))}
      </ol>
    </main>
  );
}

export default Proof.browser({
  title:
    'Sequences that start with the same key branch on the next one, and a wrong key cancels them',
  description:
    '`g i`, `g s` and `g d` start the same and do not Conflict. `g` then `x` matches none of them, so every one Cancels and the folder stays.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider sequence={{ timeout: 2000 }}>
        <style>{css}</style>
        <Mail />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the Inbox is open',
        (yield* tab.text('nav [aria-current="true"]')) === 'Inbox',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Press g then x, which no Sequence has', 'g', 'x');
      const afterWrong = yield* tab.text('nav [aria-current="true"]');
      yield* tab.press('Go to Sent with g s', 'g', 's');
      const afterSent = yield* tab.text('nav [aria-current="true"]');
      yield* tab.press('Go to Drafts with g d', 'g', 'd');
      return {
        afterWrong,
        afterSent,
        afterDrafts: yield* tab.text('nav [aria-current="true"]'),
        log: yield* tab.evaluate(() =>
          [...document.querySelectorAll('li.log')].map(
            (item) => item.textContent,
          ),
        ),
      };
    }),
  verify: ({ afterWrong, afterSent, afterDrafts, log }) =>
    Effect.gen(function* () {
      yield* Proof.assert('g x left the Inbox open', afterWrong === 'Inbox');
      yield* Proof.assert(
        'g x Cancelled all three Sequences for a wrong key',
        log.slice(0, 3).every((line) => line?.endsWith('cancelled, wrong key')),
      );
      yield* Proof.assert('g s went to Sent', afterSent === 'Sent');
      yield* Proof.assert('g d went to Drafts', afterDrafts === 'Drafts');
      yield* Proof.assert(
        'only the two complete Sequences committed',
        JSON.stringify(log.filter((line) => line?.includes('went to'))) ===
          JSON.stringify(['g s: went to Sent', 'g d: went to Drafts']),
      );
    }),
});
