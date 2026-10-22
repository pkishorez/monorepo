import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe } from '@kestack/use-keys';
import { createKeys } from '@kestack/use-keys/surfaces';

// The composer sits inside the session here, and nowhere else.
const keys = createKeys({
  session: {
    initial: true,
    actions: { new: { keys: 'n', label: 'New session' } },
    surfaces: {
      composer: { actions: { pick: { keys: 'p', label: 'Pick a model' } } },
    },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 900px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .row { display: flex; gap: 16px; align-items: flex-start; }
  .page { flex: 1; display: grid; gap: 12px; }
  .session, .composer { padding: 16px 18px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; outline: none; cursor: pointer; }
  [data-state="active"] { border-color: #2563eb; }
  [data-state="parent"] { border-color: #93c5fd; }
  .surface { display: inline-block; margin-bottom: 14px; padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .log { color: #166534; font-weight: 600; min-height: 27px; }
  table { width: 360px; border-collapse: separate; border-spacing: 0; padding: 4px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; font-size: 16px; }
  tr:first-child td { border-top: 0; }
  td { padding: 10px 12px; border-top: 1px solid #f4f4f5; }
`;

function Keyboard() {
  const actions = keys.useAvailableActions();
  return (
    <table id="keys">
      <tbody>
        {actions.map((action) => (
          <tr key={action.id}>
            <td>{action.keys.map(describe).join(', ')}</td>
            <td>{action.label}</td>
            <td>{action.surface}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

function App() {
  const [done, setDone] = useState<ReadonlyArray<string>>([]);
  const log = (what: string) => setDone((now) => [...now, what]);
  keys.useAction('session.new', () => log('New session'));
  keys.useAction('composer.pick', () => log('Pick a model'));
  return (
    <main>
      <h1>Chat</h1>
      <p>
        The composer is drawn beside the session, not in it, but the keys tree
        puts it in the session: <kbd>n</kbd> still climbs to the session from
        the composer.
      </p>
      <Status />
      <div className="row">
        <div className="page">
          <keys.Surface id="session" className="session">
            <div id="session">Session: Plan the launch</div>
          </keys.Surface>
          <keys.Surface id="composer" className="composer">
            <div id="composer">Write a message…</div>
          </keys.Surface>
          <div className="log" id="log">
            {done.join(', ')}
          </div>
        </div>
        <Keyboard />
      </div>
    </main>
  );
}

function Root() {
  return (
    <keys.Provider vim>
      <style>{css}</style>
      <App />
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'The keys tree, not the page, decides which Surface is inside which',
  description:
    'The composer’s element is a sibling of the session’s, yet the definition nests the composer in the session. In the composer, p works and n still climbs to the session, which is shown as its Parent.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(<Root />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the session is the Active Surface, and the composer is not in its element',
        (yield* tab.text('#surface')) === 'Active Surface: session' &&
          (yield* tab.evaluate(
            () =>
              document
                .querySelector('[data-surface="composer"]')
                ?.closest('[data-surface="session"]') === null,
          )),
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      const rows = tab.evaluate(() =>
        [...document.querySelectorAll('#keys tr')].map((row) =>
          [...row.querySelectorAll('td')].map((cell) => cell.textContent),
        ),
      );
      const inSession = yield* rows;
      yield* tab.press('Press n, then p, in the session', 'n', 'p');
      const logInSession = yield* tab.text('#log');
      yield* tab.click('Click the composer', '#composer');
      const inComposer = yield* rows;
      const sessionState = yield* tab.evaluate(() =>
        document
          .querySelector('[data-surface="session"]')
          ?.getAttribute('data-state'),
      );
      yield* tab.press('Press p, then n, in the composer', 'p', 'n');
      return {
        inSession,
        logInSession,
        inComposer,
        sessionState,
        surface: yield* tab.text('#surface'),
        log: yield* tab.text('#log'),
      };
    }),
  verify: ({
    inSession,
    logInSession,
    inComposer,
    sessionState,
    surface,
    log,
  }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'in the session, only n works',
        JSON.stringify(inSession) ===
          JSON.stringify([['n', 'New session', 'session']]),
      );
      yield* Proof.assert(
        'in the session, n ran and p did nothing',
        logInSession === 'New session',
      );
      yield* Proof.assert(
        'in the composer, p is its own and n climbs to the session, its Parent',
        surface === 'Active Surface: composer' &&
          sessionState === 'parent' &&
          JSON.stringify(inComposer) ===
            JSON.stringify([
              ['p', 'Pick a model', 'composer'],
              ['n', 'New session', 'session'],
            ]),
      );
      yield* Proof.assert(
        'in the composer, p and n both ran',
        log === 'New session, Pick a model, New session',
      );
    }),
});
