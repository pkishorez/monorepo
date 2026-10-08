import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 720px; margin: 56px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 20px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  label { display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px; margin-bottom: 20px; border-radius: 12px; background: #fff; border: 1px solid #e4e4e7; font-weight: 600; cursor: pointer; }
  input { width: 20px; height: 20px; }
  label.paused { background: #fef3c7; border-color: #f59e0b; }
  ul { list-style: none; margin: 0; padding: 8px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  li { padding: 12px 18px; border-radius: 10px; }
  li[aria-current="true"] { background: #18181b; color: #fff; }
`;

const tracks = ['Intro', 'Northern lights', 'Slow river', 'Night drive'];

function Playlist() {
  const [at, setAt] = useState(0);
  useShortcut('j', () => setAt((now) => Math.min(tracks.length - 1, now + 1)));
  return (
    <ul>
      {tracks.map((track, index) => (
        <li key={track} aria-current={index === at}>
          {track}
        </li>
      ))}
    </ul>
  );
}

function App() {
  const [paused, setPaused] = useState(false);
  return (
    <KeysProvider enabled={!paused}>
      <style>{css}</style>
      <main>
        <h1>Playlist</h1>
        <p>
          <kbd>j</kbd> plays the next track
        </p>
        <label className={paused ? 'paused' : ''}>
          <input
            type="checkbox"
            checked={paused}
            onChange={(event) => setPaused(event.target.checked)}
          />
          Pause keyboard shortcuts
        </label>
        <Playlist />
      </main>
    </KeysProvider>
  );
}

export default Proof.browser({
  title:
    'Pausing the provider turns off every Shortcut inside it until you turn it back on',
  description:
    "The provider's `enabled` silences everything inside it at once, and turning it back on brings them back.",
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
        'the first track is selected',
        (yield* tab.text('li[aria-current="true"]')) === 'Intro',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.click('Pause the shortcuts', 'text=Pause keyboard shortcuts');
      yield* tab.press('Press j while paused', 'j', 'j');
      const whilePaused = yield* tab.text('li[aria-current="true"]');
      yield* tab.click('Turn them back on', 'text=Pause keyboard shortcuts');
      yield* tab.press('Press j again', 'j');
      const afterResume = yield* tab.text('li[aria-current="true"]');
      return { whilePaused, afterResume };
    }),
  verify: ({ whilePaused, afterResume }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'j did nothing while paused',
        whilePaused === 'Intro',
      );
      yield* Proof.assert(
        'j moved to the next track once resumed',
        afterResume === 'Northern lights',
      );
    }),
});
