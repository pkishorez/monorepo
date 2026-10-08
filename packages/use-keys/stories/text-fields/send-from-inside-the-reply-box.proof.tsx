import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 48px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  textarea { box-sizing: border-box; width: 100%; height: 120px; margin-bottom: 16px; padding: 12px 16px; font: inherit; border: 1px solid #d4d4d8; border-radius: 12px; background: #fff; resize: none; }
  textarea:focus { outline: 3px solid #93c5fd; border-color: #3b82f6; }
  .status { display: inline-block; padding: 10px 20px; border-radius: 999px; background: #e4e4e7; color: #3f3f46; font-weight: 600; font-size: 20px; }
  .status.sent { background: #16a34a; color: #fff; }
`;

function Reply() {
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  useShortcut('mod+Enter', () => setSent(draft), { inTextEntry: true });
  useShortcut('mod+shift+d', () => setDraft(''));
  return (
    <main>
      <h1>Reply to Grace</h1>
      <p>
        <kbd>mod</kbd> <kbd>Enter</kbd> sends, even from the reply box.{' '}
        <kbd>mod</kbd> <kbd>shift</kbd> <kbd>d</kbd> discards, but only from
        outside it.
      </p>
      <textarea
        aria-label="Reply"
        placeholder="Write a reply"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <span className={sent === null ? 'status' : 'status sent'} id="sent">
        {sent === null ? 'Not sent' : `Sent: ${sent}`}
      </span>
    </main>
  );
}

export default Proof.browser({
  title: 'Inside a text field, only a modified Shortcut that asks for it fires',
  description:
    '`mod+Enter` has `inTextEntry`, so it sends from inside the reply box. `mod+shift+d` does not ask, so it cannot discard the draft being typed.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider>
        <style>{css}</style>
        <Reply />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'nothing is sent yet',
        (yield* tab.text('#sent')) === 'Not sent',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.type('Write a reply', 'textarea', 'See you at noon');
      yield* tab.press(
        'Press mod+shift+D inside the reply box',
        'ControlOrMeta+Shift+D',
      );
      const draftAfterDiscard = yield* tab.evaluate(
        () => document.querySelector('textarea')?.value,
      );
      yield* tab.press('Send with mod+Enter', 'ControlOrMeta+Enter');
      return { draftAfterDiscard, sent: yield* tab.text('#sent') };
    }),
  verify: ({ draftAfterDiscard, sent }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'mod+shift+d did not discard the draft from inside the box',
        draftAfterDiscard === 'See you at noon',
      );
      yield* Proof.assert(
        'mod+Enter sent the reply from inside the box',
        sent === 'Sent: See you at noon',
      );
    }),
});
