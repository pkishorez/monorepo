import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { describe } from '@kestack/use-keys';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  inbox: {
    initial: true,
    actions: {
      archive: { keys: 'e', label: 'Archive the thread' },
      star: { keys: 's', label: 'Star the thread' },
    },
    surfaces: {
      draft: { actions: { edit: { keys: 'e', label: 'Edit the draft' } } },
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
  .inbox { flex: 1; padding: 18px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; outline: none; }
  .draft { margin-top: 14px; padding: 14px 16px; border: 2px dashed #d4d4d8; border-radius: 12px; outline: none; cursor: text; }
  [data-state="active"] { border-color: #2563eb; border-style: solid; }
  .surface { display: inline-block; margin-bottom: 14px; padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .log { margin-top: 14px; color: #166534; font-weight: 600; }
  table { width: 380px; border-collapse: separate; border-spacing: 0; padding: 4px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; font-size: 16px; }
  tr:first-child td { border-top: 0; }
  td { padding: 10px 12px; border-top: 1px solid #f4f4f5; }
  td:last-child { text-align: right; }
  .state { padding: 2px 10px; border-radius: 999px; font-size: 14px; font-weight: 600; background: #dcfce7; color: #166534; }
  .state.shadowed { background: #fef3c7; color: #92400e; }
`;

function Keyboard() {
  const actions = keys.useAvailableActions();
  return (
    <table>
      <tbody>
        {actions.map((action) => (
          <tr key={action.id} data-label={action.label}>
            <td>
              <kbd>{action.keys.map(describe).join(', ')}</kbd>
            </td>
            <td>
              {action.label} <small>({action.surface})</small>
            </td>
            <td>
              <span className={action.shadowed ? 'state shadowed' : 'state'}>
                {action.shadowed ? 'shadowed' : 'works'}
              </span>
            </td>
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

function Inbox() {
  const [done, setDone] = useState<ReadonlyArray<string>>([]);
  const log = (what: string) => setDone((now) => [...now, what]);
  keys.useAction('inbox.archive', () => log('Archived the thread'));
  keys.useAction('inbox.star', () => log('Starred the thread'));
  keys.useAction('draft.edit', () => log('Editing the draft'));
  return (
    <keys.Surface id="inbox" className="inbox">
      <Status />
      <div>Lunch on Friday? — from Grace</div>
      <keys.Surface id="draft" className="draft">
        <span id="draft">Draft: Thanks, see you on Friday!</span>
      </keys.Surface>
      <div className="log" id="log">
        {done.join(', ')}
      </div>
    </keys.Surface>
  );
}

function App() {
  return (
    <keys.Provider vim>
      <style>{css}</style>
      <main>
        <h1>Mail</h1>
        <p>
          The inbox binds <kbd>e</kbd> to archive; the draft inside it binds{' '}
          <kbd>e</kbd> to edit. In the draft, the nearer one wins.
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
  title: 'In the draft, e edits it instead of archiving the thread',
  description:
    'The inbox and the draft inside it both bind e. A key climbs from the Active Surface outward and the nearest Action wins, so the inbox’s e is Shadowed; s, which only the inbox binds, still climbs to it.',
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
        'the inbox is Active, and its e works',
        (yield* tab.text('#surface')) === 'Active Surface: inbox' &&
          (yield* tab.text('[data-label="Archive the thread"] .state')) ===
            'works',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.click('Click into the draft', '#draft');
      const inDraft = {
        surface: yield* tab.text('#surface'),
        archive: yield* tab.text('[data-label="Archive the thread"] .state'),
        edit: yield* tab.text('[data-label="Edit the draft"] .state'),
      };
      yield* tab.press('Press e in the draft', 'e');
      yield* tab.press('Press s in the draft', 's');
      return { inDraft, log: yield* tab.text('#log') };
    }),
  verify: ({ inDraft, log }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'in the draft, the inbox’s e is Shadowed by the draft’s',
        inDraft.surface === 'Active Surface: draft' &&
          inDraft.archive === 'shadowed' &&
          inDraft.edit === 'works',
      );
      yield* Proof.assert(
        'e edited the draft and archived nothing; s climbed to the inbox',
        log === 'Editing the draft, Starred the thread',
      );
    }),
});
