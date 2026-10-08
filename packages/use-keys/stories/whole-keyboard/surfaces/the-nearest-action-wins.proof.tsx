import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe, shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 860px; margin: 32px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .row { display: flex; gap: 16px; align-items: flex-start; }
  .app { flex: 1; min-height: 200px; padding: 18px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; }
  .app.closed { display: grid; place-items: center; color: #71717a; font-size: 22px; font-weight: 600; background: #e4e4e7; }
  .reply { margin-top: 14px; padding: 14px 16px; border: 2px solid #2563eb; border-radius: 12px; }
  .reply b { color: #2563eb; }
  .surface { display: inline-block; margin-bottom: 14px; padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  table { width: 360px; border-collapse: separate; border-spacing: 0; padding: 4px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; font-size: 16px; }
  tr:first-child td { border-top: 0; }
  td { padding: 10px 12px; border-top: 1px solid #f4f4f5; }
  td:last-child { text-align: right; }
  .state { padding: 2px 10px; border-radius: 999px; font-size: 14px; font-weight: 600; background: #e4e4e7; color: #52525b; }
  .state.active { background: #dcfce7; color: #166534; }
  .state.shadowed { background: #fef3c7; color: #92400e; }
`;

const keys = createKeys({
  actions: {
    close: { keys: [shortcut('Escape')], description: 'Close the inbox' },
  },
  surfaces: {
    inbox: {
      actions: {
        respond: { keys: [shortcut('r')], description: 'Reply' },
      },
      surfaces: {
        reply: {
          actions: {
            discard: {
              keys: [shortcut('Escape')],
              description: 'Discard the draft',
            },
          },
        },
      },
    },
  },
});

function Keyboard() {
  const status = keys.useStatus();
  return (
    <table>
      <tbody>
        {status.actions.map((action) => (
          <tr key={action.id} data-action={action.id}>
            <td>
              <kbd>
                {action.bindings
                  .map(({ binding }) => describe(binding))
                  .join(', ')}
              </kbd>
            </td>
            <td>{action.description}</td>
            <td>
              <span className={`state ${action.state}`}>{action.state}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Inbox() {
  const { surface, setSurface, openSurface, closeSurface } = keys.useSurface();
  const [draft, setDraft] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  keys.useAction('close', () => {
    setClosed(true);
    setSurface(null);
  });
  keys.useAction('inbox.respond', () => {
    setDraft('Thanks, see you on Friday!');
    openSurface('inbox.reply');
  });
  keys.useAction('inbox.reply.discard', () => {
    setDraft(null);
    closeSurface('inbox.reply');
  });
  if (closed)
    return (
      <div className="app closed" id="app">
        Inbox closed
      </div>
    );
  return (
    <div className="app" id="app">
      <span className="surface" id="surface">
        Active Surface: {surface ?? 'none'}
      </span>
      <div>Lunch on Friday? — from Grace</div>
      {draft === null ? null : (
        <div className="reply" id="draft">
          <b>Draft:</b> {draft}
        </div>
      )}
    </div>
  );
}

function App() {
  const [surface, setSurface] = useState<'inbox' | 'inbox.reply' | null>(
    'inbox',
  );
  return (
    <keys.Provider surface={surface} onSurfaceChange={setSurface}>
      <style>{css}</style>
      <main>
        <h1>Mail</h1>
        <p>
          <kbd>Esc</kbd> closes the inbox, but while replying the reply’s own{' '}
          <kbd>Esc</kbd> discards the draft instead.
        </p>
        <div className="row">
          <Inbox />
          <Keyboard />
        </div>
      </main>
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'While replying, Escape discards the draft and leaves the inbox open',
  description:
    'Escape is bound twice: globally to close the inbox, and in the reply Surface to discard. The nearer Action wins and the global one is Shadowed, as the keyboard table shows.',
  critical: true,
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* Proof.assert(
        'the inbox is open, and Escape closes it',
        (yield* tab.text('#surface')) === 'Active Surface: inbox' &&
          (yield* tab.text('[data-action="close"] .state')) === 'active',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Reply with r', 'r');
      const replying = {
        surface: yield* tab.text('#surface'),
        close: yield* tab.text('[data-action="close"] .state'),
      };
      yield* tab.press('Press Escape while replying', 'Escape');
      const afterFirst = {
        app: yield* tab.text('#app'),
        drafts: yield* tab.count('#draft'),
      };
      yield* tab.press('Press Escape in the inbox', 'Escape');
      return { replying, afterFirst, afterSecond: yield* tab.text('#app') };
    }),
  verify: ({ replying, afterFirst, afterSecond }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'while replying, the global close is Shadowed',
        replying.surface === 'Active Surface: inbox.reply' &&
          replying.close === 'shadowed',
      );
      yield* Proof.assert(
        'the first Escape discarded the draft and left the inbox open',
        afterFirst.drafts === 0 && afterFirst.app !== 'Inbox closed',
      );
      yield* Proof.assert(
        'the next Escape, back in the inbox, closed it',
        afterSecond === 'Inbox closed',
      );
    }),
});
