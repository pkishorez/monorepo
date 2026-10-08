import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { position: relative; max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 16px; padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .thread { padding: 20px; background: #fff; border: 1px solid #e4e4e7; border-radius: 16px; }
  .reply { margin-top: 14px; padding: 14px 16px; border: 2px solid #2563eb; border-radius: 12px; color: #1e3a8a; }
  .palette { position: absolute; top: 120px; left: 50%; transform: translateX(-50%); width: 460px; padding: 18px 20px; background: #fff; border-radius: 16px; box-shadow: 0 30px 70px rgba(0,0,0,0.25); }
  .palette div { padding: 8px 12px; border-radius: 8px; }
  .palette div:first-child { background: #eff6ff; }
`;

const keys = createKeys({
  actions: {
    commands: {
      keys: [shortcut('mod+k')],
      description: 'Open the command palette',
    },
  },
  surfaces: {
    inbox: {
      actions: { respond: { keys: [shortcut('r')], description: 'Reply' } },
      surfaces: { reply: {} },
    },
    palette: {
      isolated: true,
      actions: {
        close: { keys: [shortcut('Escape')], description: 'Close' },
      },
    },
  },
});

function Palette() {
  const { surface, openSurface, closeSurface } = keys.useSurface();
  keys.useAction('commands', () => openSurface('palette'));
  keys.useAction('palette.close', () => closeSurface('palette'));
  if (surface !== 'palette') return null;
  return (
    <div className="palette" id="palette">
      <div>Archive thread</div>
      <div>Snooze until tomorrow</div>
      <div>Mark as unread</div>
    </div>
  );
}

function Inbox() {
  const { surface, openSurface } = keys.useSurface();
  keys.useAction('inbox.respond', () => openSurface('inbox.reply'));
  return (
    <div className="thread">
      Lunch on Friday? — from Grace
      {surface === 'inbox.reply' || surface === 'palette' ? (
        <div className="reply">Replying…</div>
      ) : null}
    </div>
  );
}

function App() {
  const [surface, setSurface] = useState<
    'inbox' | 'inbox.reply' | 'palette' | null
  >('inbox');
  return (
    <keys.Provider surface={surface} onSurfaceChange={setSurface}>
      <style>{css}</style>
      <main>
        <h1>Mail</h1>
        <p>
          <kbd>r</kbd> replies, <kbd>mod</kbd> <kbd>k</kbd> opens the palette
          from anywhere, <kbd>Esc</kbd> closes it.
        </p>
        <span className="surface" id="surface">
          Active Surface: {surface ?? 'none'}
        </span>
        <Inbox />
        <Palette />
      </main>
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'Closing the palette goes back to where it was opened from',
  description:
    '`openSurface` remembers the Active Surface it came from, and `closeSurface` goes back there. Opening the palette again while it is open changes nothing.',
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* tab.press('Start a reply with r', 'r');
      yield* Proof.assert(
        'the reply is the Active Surface',
        (yield* tab.text('#surface')) === 'Active Surface: inbox.reply',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Open the palette', 'ControlOrMeta+k');
      const opened = yield* tab.text('#surface');
      yield* tab.press('Ask for the palette again', 'ControlOrMeta+k');
      const again = yield* tab.text('#surface');
      yield* tab.press('Close the palette with Escape', 'Escape');
      return {
        opened,
        again,
        closed: yield* tab.text('#surface'),
        paletteShown: yield* tab.count('#palette'),
      };
    }),
  verify: ({ opened, again, closed, paletteShown }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'mod+k made the palette Active',
        opened === 'Active Surface: palette',
      );
      yield* Proof.assert(
        'mod+k again left it as it was',
        again === 'Active Surface: palette',
      );
      yield* Proof.assert(
        'one Escape closed it and went back to the reply',
        closed === 'Active Surface: inbox.reply' && paletteShown === 0,
      );
    }),
});
