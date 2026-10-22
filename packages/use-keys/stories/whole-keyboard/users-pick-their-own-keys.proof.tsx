import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe } from '@kestack/use-keys';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  inbox: {
    actions: { next: { keys: ['j', 'ArrowDown'], label: 'Next thread' } },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; outline: none; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .settings { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding: 14px 18px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  button { font: inherit; font-weight: 600; padding: 8px 16px; border: 0; border-radius: 10px; background: #2563eb; color: #fff; cursor: pointer; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 10px 16px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const threads = [
  'Quarterly report',
  'Lunch on Friday?',
  'Design review',
  'Invoice #2041',
];

function Inbox(props: { readonly onCustomize: () => void }) {
  const [at, setAt] = useState(0);
  keys.useAction('inbox.next', () =>
    setAt((now) => Math.min(threads.length - 1, now + 1)),
  );
  const next = keys.useAvailableActions().find(({ id }) => id === 'inbox.next');
  return (
    <>
      <div className="settings">
        <span>
          Next thread:{' '}
          <span id="next-keys">
            {next?.keys.map((binding) => (
              <kbd key={describe(binding)}>{describe(binding)}</kbd>
            ))}
          </span>
        </span>
        <button onClick={props.onCustomize}>Use n for next thread</button>
      </div>
      <ul>
        {threads.map((each, index) => (
          <li key={each} aria-current={index === at}>
            {each}
          </li>
        ))}
      </ul>
    </>
  );
}

type Bindings = NonNullable<Parameters<typeof keys.Provider>[0]['bindings']>;

function App() {
  // In an app, the user's choice would live in their settings.
  const [bindings, setBindings] = useState<Bindings>({});
  return (
    <keys.Provider vim bindings={bindings}>
      <style>{css}</style>
      <keys.Surface id="inbox" asChild>
        <main>
          <h1>Inbox</h1>
          <p>The user's own keys replace an Action's defaults.</p>
          <Inbox onCustomize={() => setBindings({ 'inbox.next': 'n' })} />
        </main>
      </keys.Surface>
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'A key the user picks replaces every default at once, with no reload',
  description:
    'The provider takes the user’s own keys by Action id, in `bindings`. Next thread starts on j and ↓; once the user picks n, j and ↓ do nothing and n moves, with no reload.',
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'Next thread is bound to j and ↓',
        (yield* tab.text('#next-keys')) === 'jArrowDown',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const selected = tab.text('li[aria-current="true"]');
      yield* tab.press('Next thread with j', 'j');
      const before = yield* selected;
      yield* tab.click(
        'Choose n instead',
        'role=button[name="Use n for next thread"]',
      );
      const bound = yield* tab.text('#next-keys');
      yield* tab.press('Press j and ↓, the old defaults', 'j', 'ArrowDown');
      const oldKeys = yield* selected;
      yield* tab.press('Press n', 'n');
      return { before, bound, oldKeys, newKey: yield* selected };
    }),
  verify: ({ before, bound, oldKeys, newKey }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'j moved with the defaults',
        before === 'Lunch on Friday?',
      );
      yield* Proof.assert('Next thread is now bound to n only', bound === 'n');
      yield* Proof.assert(
        'j and ↓ no longer move',
        oldKeys === 'Lunch on Friday?',
      );
      yield* Proof.assert('n moves', newKey === 'Design review');
    }),
});
