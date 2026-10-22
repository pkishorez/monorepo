import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { createKeys } from '@kestack/use-keys/surfaces';

const keys = createKeys({
  mail: {
    focusable: false,
    actions: {
      palette: {
        keys: 'mod+k',
        label: 'Open the command palette',
        enters: 'palette',
      },
    },
    surfaces: {
      threads: { initial: true },
      reply: {},
      palette: { isolated: true },
    },
  },
});

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { position: relative; max-width: 820px; margin: 40px auto; padding: 0 24px; outline: none; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .surface { display: inline-block; margin-bottom: 16px; padding: 6px 16px; border-radius: 999px; background: #18181b; color: #fff; font-weight: 600; }
  .panes { display: flex; gap: 16px; }
  section { flex: 1; min-height: 140px; padding: 18px; background: #fff; border: 2px solid #e4e4e7; border-radius: 16px; outline: none; cursor: pointer; }
  section[data-state="active"] { border-color: #2563eb; }
  .palette { position: absolute; top: 120px; left: 50%; transform: translateX(-50%); width: 460px; padding: 18px 20px; background: #fff; border-radius: 16px; box-shadow: 0 30px 70px rgba(0,0,0,0.25); outline: none; }
  .palette div { padding: 8px 12px; border-radius: 8px; }
  .palette div:first-child { background: #eff6ff; }
`;

function Palette() {
  if (!keys.useSurface('palette').active) return null;
  return (
    <keys.Surface id="palette" className="palette" asChild>
      <div id="palette">
        <div>Archive thread</div>
        <div>Snooze until tomorrow</div>
        <div>Mark as unread</div>
      </div>
    </keys.Surface>
  );
}

function Pane(props: {
  readonly id: 'threads' | 'reply';
  readonly children: string;
}) {
  return (
    <keys.Surface id={props.id} asChild>
      <section id={props.id}>{props.children}</section>
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

function App() {
  return (
    <keys.Provider vim>
      <style>{css}</style>
      <main>
        <h1>Mail</h1>
        <p>
          <kbd>mod</kbd> <kbd>k</kbd> opens the palette from either pane,{' '}
          <kbd>Esc</kbd> closes it.
        </p>
        <Status />
        <div className="panes">
          <Pane id="threads">Lunch on Friday? — from Grace</Pane>
          <Pane id="reply">Thanks, see you on Friday!</Pane>
        </div>
        <Palette />
      </main>
    </keys.Provider>
  );
}

export default Proof.browser({
  title: 'Closing the palette goes back to where it was opened from',
  description:
    'An isolated Surface remembers the Active Surface it was entered from. Opened from the reply, the palette goes back to the reply when Escape closes it; asking for it again while it is open does nothing, since no key climbs out of it.',
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* tab.click('Click the reply', '#reply');
      yield* Proof.assert(
        'the reply is the Active Surface',
        (yield* tab.text('#surface')) === 'Active Surface: reply',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.press('Open the palette', 'ControlOrMeta+k');
      const opened = yield* tab.text('#surface');
      yield* tab.press('Ask for the palette again', 'ControlOrMeta+k');
      const again = {
        surface: yield* tab.text('#surface'),
        palettes: yield* tab.count('#palette'),
      };
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
        again.surface === 'Active Surface: palette' && again.palettes === 1,
      );
      yield* Proof.assert(
        'one Escape closed it and went back to the reply',
        closed === 'Active Surface: reply' && paletteShown === 0,
      );
    }),
});
