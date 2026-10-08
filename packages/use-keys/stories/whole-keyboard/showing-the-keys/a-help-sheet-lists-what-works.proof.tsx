import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe, sequence, shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 17px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 980px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  p { color: #52525b; margin: 0 0 14px; }
  kbd { font: 600 13px Menlo, Consolas, monospace; padding: 2px 7px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; white-space: nowrap; }
  .row { display: flex; gap: 16px; align-items: flex-start; }
  .app { flex: 1; padding: 18px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; }
  .surface { display: inline-block; margin-bottom: 12px; padding: 5px 14px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .compose { padding: 14px; border: 2px solid #2563eb; border-radius: 12px; color: #1e3a8a; }
  .help { width: 470px; padding: 14px 16px; background: #fff; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
  .help h2 { margin: 0 0 8px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 5px 6px; border-top: 1px solid #f4f4f5; }
  td:last-child { text-align: right; }
  tr.inactive, tr.unhandled { color: #a1a1aa; }
  .state { padding: 1px 9px; border-radius: 999px; font-size: 13px; font-weight: 600; background: #f4f4f5; }
  .state.active { background: #dcfce7; color: #166534; }
`;

const keys = createKeys({
  actions: {
    help: { keys: [shortcut('?')], description: 'Show these keys' },
  },
  surfaces: {
    inbox: {
      actions: {
        next: {
          keys: [shortcut('j'), shortcut('ArrowDown')],
          description: 'Next thread',
        },
        top: { keys: [sequence('g g')], description: 'First thread' },
        write: { keys: [shortcut('c')], description: 'Compose' },
        snooze: { keys: [shortcut('b')], description: 'Snooze (coming soon)' },
      },
    },
    compose: {
      isolated: true,
      actions: {
        send: {
          keys: [shortcut('mod+Enter')],
          description: 'Send',
          inTextEntry: true,
        },
        discard: { keys: [shortcut('Escape')], description: 'Discard' },
      },
    },
  },
});

function Help() {
  const status = keys.useStatus();
  return (
    <div className="help" id="help">
      <h2>Keyboard shortcuts</h2>
      <table>
        <tbody>
          {status.actions.map((action) => (
            <tr
              key={action.id}
              className={action.state}
              data-action={action.id}
            >
              <td>
                {action.bindings.map(({ binding }) => (
                  <kbd key={describe(binding)}>{describe(binding)}</kbd>
                ))}
              </td>
              <td>{action.description}</td>
              <td>
                <span className={`state ${action.state}`}>{action.state}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mail() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  const [help, setHelp] = useState(false);
  const [at, setAt] = useState(0);
  keys.useAction('help', () => setHelp((now) => !now));
  keys.useAction('inbox.next', () => setAt((now) => now + 1));
  keys.useAction('inbox.top', () => setAt(0));
  keys.useAction('inbox.write', () => openSurface('compose'));
  keys.useAction('compose.send', () => closeSurface('compose'));
  keys.useAction('compose.discard', () => closeSurface('compose'));
  return (
    <main>
      <h1>Mail</h1>
      <p>
        <kbd>?</kbd> shows every key and whether it works right now.
      </p>
      <div className="row">
        <div className="app">
          <span className="surface" id="surface">
            Active Surface: {surface ?? 'none'}
          </span>
          {surface === 'compose' ? (
            <div className="compose">New message to Grace…</div>
          ) : (
            <div>Thread {at + 1} of 12 selected</div>
          )}
        </div>
        {help ? <Help /> : null}
      </div>
    </main>
  );
}

function App() {
  const [surface, setSurface] = useState<'inbox' | 'compose' | null>('inbox');
  return (
    <keys.Provider surface={surface} onSurfaceChange={setSurface}>
      <style>{css}</style>
      <Mail />
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'The help sheet lists every key, and which ones work right now',
  description:
    '`useStatus` lists every Action with `describe`d keys and its state. It follows the Active Surface: composing makes the inbox inactive. An Action with no Handler is listed as unhandled.',
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the help is hidden',
        (yield* tab.count('#help')) === 0,
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const states = tab.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('tr[data-action]')].map((row) => [
            row.getAttribute('data-action'),
            `${row.querySelector('td')?.textContent} ${row.querySelector('.state')?.textContent}`,
          ]),
        ),
      );
      yield* tab.press('Show the keys with ?', '?');
      const inInbox = yield* states;
      yield* tab.press('Compose with c', 'c');
      const composing = yield* states;
      return { inInbox, composing };
    }),
  verify: ({ inInbox, composing }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'in the inbox, its keys and the global ? are active, written as people write them',
        inInbox['help'] === '? active' &&
          inInbox['inbox.next'] === 'jArrowDown active' &&
          inInbox['inbox.top'] === 'g g active' &&
          inInbox['compose.send'] === 'mod+Enter inactive',
      );
      yield* Proof.assert(
        'snooze, with no Handler, is listed as unhandled',
        inInbox['inbox.snooze'] === 'b unhandled',
      );
      yield* Proof.assert(
        'while composing, compose keys are active and the inbox keys are inactive',
        composing['compose.send'] === 'mod+Enter active' &&
          composing['compose.discard'] === 'Escape active' &&
          composing['inbox.next'] === 'jArrowDown inactive' &&
          composing['help'] === '? active',
      );
    }),
});
