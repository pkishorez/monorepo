import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe } from '@kestack/use-keys';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  mail: {
    actions: { help: { keys: '?', label: 'Show these keys' } },
    surfaces: {
      inbox: {
        initial: true,
        actions: {
          next: { keys: ['j', 'ArrowDown'], label: 'Next thread' },
          first: { keys: 'g g', label: 'First thread' },
          compose: { keys: 'c', label: 'Compose', enters: 'compose' },
        },
        surfaces: {
          compose: {
            isolated: true,
            actions: {
              send: { keys: 'mod+Enter', label: 'Send' },
              discard: { keys: 'Escape', label: 'Discard' },
            },
          },
        },
      },
    },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 17px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 980px; margin: 32px auto; padding: 0 24px; outline: none; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  p { color: #52525b; margin: 0 0 14px; }
  kbd { font: 600 13px Menlo, Consolas, monospace; padding: 2px 7px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; white-space: nowrap; }
  .row { display: flex; gap: 16px; align-items: flex-start; }
  .app { flex: 1; padding: 18px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; outline: none; }
  .surface { display: inline-block; margin-bottom: 12px; padding: 5px 14px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .compose { padding: 14px; border: 2px solid #2563eb; border-radius: 12px; color: #1e3a8a; outline: none; }
  .help { width: 420px; padding: 14px 16px; background: #fff; border-radius: 16px; box-shadow: 0 20px 50px rgba(0,0,0,0.15); }
  .help h2 { margin: 0 0 8px; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 5px 6px; border-top: 1px solid #f4f4f5; }
  td:last-child { text-align: right; color: #71717a; }
`;

function Help() {
  const actions = keys.useAvailableActions();
  return (
    <div className="help" id="help">
      <h2>Keys that work here</h2>
      <table>
        <tbody>
          {actions.map((action) => (
            <tr key={action.id}>
              <td>
                {action.keys.map((binding) => (
                  <kbd key={describe(binding)}>{describe(binding)}</kbd>
                ))}
              </td>
              <td>{action.label}</td>
              <td>{action.surface}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Compose() {
  const { leave } = keys.useKeyboard();
  keys.useAction('compose.send', () => leave('compose'));
  keys.useAction('compose.discard', () => leave('compose'));
  return (
    <keys.Surface id="compose" className="compose">
      New message to Grace…
    </keys.Surface>
  );
}

function Status() {
  const active = keys.useActive();
  return (
    <span className="surface" id="surface">
      Active Surface: {active}
    </span>
  );
}

function Inbox() {
  const [, setAt] = useState(0);
  keys.useAction('inbox.next', () => setAt((now) => now + 1));
  keys.useAction('inbox.first', () => setAt(0));
  const composing = keys.useSurface('compose').active;
  return (
    <keys.Surface id="inbox" className="app">
      <Status />
      {composing ? <Compose /> : <div>Grace — Lunch on Friday?</div>}
    </keys.Surface>
  );
}

function Mail() {
  const [help, setHelp] = useState(false);
  keys.useAction('mail.help', () => setHelp((now) => !now));
  return (
    <keys.Surface id="mail" asChild>
      <main>
        <h1>Mail</h1>
        <p>
          <kbd>?</kbd> shows every key that works right now.
        </p>
        <div className="row">
          <Inbox />
          {help ? <Help /> : null}
        </div>
      </main>
    </keys.Surface>
  );
}

function App() {
  return (
    <keys.Provider vim>
      <style>{css}</style>
      <Mail />
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'The help sheet lists the keys that work right now',
  description:
    '`useAvailableActions` lists every Action that works where the user is, nearest Surface first, with keys written by `describe`. In the inbox it shows the inbox keys and the ? from the mail around it; while composing, the isolated compose Surface cuts off the rest, so only its keys are listed.',
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
      const rows = tab.evaluate(() =>
        [...document.querySelectorAll('#help tr')].map((row) =>
          [...row.querySelectorAll('td')]
            .map((cell) =>
              cell.querySelector('kbd') === null
                ? cell.textContent
                : [...cell.querySelectorAll('kbd')]
                    .map((each) => each.textContent)
                    .join(' or '),
            )
            .join(' | '),
        ),
      );
      yield* tab.press('Show the keys with ?', '?');
      const inInbox = yield* rows;
      yield* tab.press('Compose with c', 'c');
      const composing = yield* rows;
      return { inInbox, composing };
    }),
  verify: ({ inInbox, composing }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'in the inbox: its keys first, then the ? of the mail around it',
        JSON.stringify(inInbox) ===
          JSON.stringify([
            'j or ArrowDown | Next thread | inbox',
            'g g | First thread | inbox',
            'c | Compose | inbox',
            '? | Show these keys | mail',
          ]),
      );
      yield* Proof.assert(
        'while composing: only the compose keys',
        JSON.stringify(composing) ===
          JSON.stringify([
            'mod+Enter | Send | compose',
            'Escape | Discard | compose',
          ]),
      );
    }),
});
