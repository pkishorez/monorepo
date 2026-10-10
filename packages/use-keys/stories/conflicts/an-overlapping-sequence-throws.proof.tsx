import { Component, type ReactNode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Effect } from 'effect';
import { Proof } from 'laymos/story';
import { KeysProvider } from '@kstackz/use-keys';
import { useSequence, useShortcut } from '@kstackz/use-keys/recognizers';

const css = `
  body { margin: 0; background: #f4f4f5; color: #18181b; font: 18px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 760px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 30px; margin: 0 0 6px; }
  p { color: #52525b; margin: 0 0 16px; }
  kbd { font: 600 14px Menlo, Consolas, monospace; padding: 2px 8px; border: 1px solid #d4d4d8; border-bottom-width: 3px; border-radius: 6px; background: #fff; color: #18181b; }
  .card { margin-bottom: 14px; padding: 16px 20px; background: #fff; border: 1px solid #e4e4e7; border-radius: 14px; }
  .card b { font-size: 26px; font-variant-numeric: tabular-nums; }
  button { font: inherit; font-weight: 600; padding: 8px 16px; border: 0; border-radius: 10px; background: #2563eb; color: #fff; cursor: pointer; }
  .error { padding: 16px 20px; border: 2px solid #dc2626; border-radius: 14px; background: #fef2f2; color: #991b1b; }
  .error strong { display: block; margin-bottom: 4px; }
  .error code { font: 15px Menlo, Consolas, monospace; }
`;

class Boundary extends Component<
  { readonly children: ReactNode },
  { readonly error: string | null }
> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div className="error" id="error">
        <strong>This feature failed to load</strong>
        <code>{this.state.error}</code>
      </div>
    );
  }
}

function Glossary() {
  const [opened, setOpened] = useState(0);
  useShortcut('g', () => setOpened((now) => now + 1));
  return (
    <div className="card">
      <kbd>g</kbd> opens the glossary. Opened <b id="opened">{opened}</b> times
    </div>
  );
}

function JumpToTop() {
  const [jumped, setJumped] = useState(false);
  useSequence('g g', () => setJumped(true));
  return (
    <div className="card">
      {jumped ? 'Jumped to the top' : 'g g jumps to the top'}
    </div>
  );
}

function App() {
  const [withJump, setWithJump] = useState(false);
  return (
    <KeysProvider>
      <style>{css}</style>
      <main>
        <h1>Handbook</h1>
        <p>
          A plugin adds <kbd>g</kbd> <kbd>g</kbd>, which starts with the{' '}
          <kbd>g</kbd> already in use.
        </p>
        <Glossary />
        {withJump ? (
          <Boundary>
            <JumpToTop />
          </Boundary>
        ) : (
          <button onClick={() => setWithJump(true)}>
            Install the jump plugin
          </button>
        )}
      </main>
    </KeysProvider>
  );
}

export default Proof.browser({
  title:
    'A Sequence that starts with a key already in use throws, and the first keeps its key',
  description:
    '`g g` starts with `g`, so the two Conflict. In development the second throws to its error boundary instead of making `g` ambiguous; `g` still opens the glossary.',
  page: (root) => {
    const app = createRoot(root);
    app.render(<App />);
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('desktop');
      yield* tab.press('Open the glossary with g', 'g');
      yield* Proof.assert(
        'g opened the glossary once',
        (yield* tab.text('#opened')) === '1',
      );
      return tab;
    }),
  act: (tab) =>
    Effect.gen(function* () {
      yield* tab.click(
        'Install the plugin that adds g g',
        'role=button[name="Install the jump plugin"]',
      );
      const error = yield* tab.text('#error code');
      yield* tab.press('Press g again', 'g');
      return { error, opened: yield* tab.text('#opened') };
    }),
  verify: ({ error, opened }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the plugin failed with a Conflict naming both Bindings',
        error.includes('"g g" conflicts with "g"'),
      );
      yield* Proof.assert('g still opens the glossary', opened === '2');
    }),
});
