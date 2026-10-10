import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useSequence, useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .pending { display: inline-block; min-width: 260px; margin-bottom: 16px; padding: 8px 18px; border-radius: 999px; background: #e4e4e7; color: #71717a; font-weight: 600; }
  .pending.on { background: #f59e0b; color: #fff; }
  ul { list-style: none; margin: 0; padding: 6px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 9px 18px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const chapters = [
  'Chapter 1: The harbour',
  'Chapter 2: A letter arrives',
  'Chapter 3: The crossing',
  'Chapter 4: Fog',
  'Chapter 5: Landfall',
  'Chapter 6: The keeper',
  'Chapter 7: Home again',
];

function Book() {
  const [at, setAt] = useState(0);
  useShortcut('shift+g', () => setAt(chapters.length - 1));
  const { pending } = useSequence('g g', () => setAt(0));
  return (
    <main>
      <h1>Contents</h1>
      <p>
        <kbd>shift</kbd> <kbd>g</kbd> jumps to the last chapter, <kbd>g</kbd>{' '}
        <kbd>g</kbd> back to the first
      </p>
      <span className={pending ? 'pending on' : 'pending'} id="pending">
        {pending ? 'g… waiting for the next key' : 'No sequence under way'}
      </span>
      <ul>
        {chapters.map((chapter, index) => (
          <li key={chapter} aria-current={index === at}>
            {chapter}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default Proof.browser({
  title:
    'g g jumps to the top, and the app can show it is waiting after the first g',
  description:
    '`useSequence` reports `pending` from its first step until it commits. The provider gives each step two seconds here, so the wait is visible.',
  page: (root) => {
    const app = createRoot(root);
    app.render(
      <KeysProvider sequence={{ timeout: 2000 }}>
        <style>{css}</style>
        <Book />
      </KeysProvider>,
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* tab.press('Jump to the last chapter', 'Shift+G');
      yield* Proof.assert(
        'the last chapter is selected',
        (yield* tab.text('li[aria-current="true"]')) ===
          'Chapter 7: Home again',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Press g once', 'g');
      const midway = yield* tab.text('#pending');
      const stillAt = yield* tab.text('li[aria-current="true"]');
      yield* tab.press('Press g again', 'g');
      return {
        midway,
        stillAt,
        after: yield* tab.text('#pending'),
        selected: yield* tab.text('li[aria-current="true"]'),
      };
    }),
  verify: ({ midway, stillAt, after, selected }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'after one g the sequence is under way and nothing moved',
        midway === 'g… waiting for the next key' &&
          stillAt === 'Chapter 7: Home again',
      );
      yield* Proof.assert(
        'the second g jumped to the first chapter',
        selected === 'Chapter 1: The harbour',
      );
      yield* Proof.assert(
        'the sequence is no longer under way',
        after === 'No sequence under way',
      );
    }),
});
