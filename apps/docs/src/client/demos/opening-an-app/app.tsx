import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { AppView, PastContext } from './screens/index.ts';
import { AppLive } from './story/index.ts';

const App = toReact(AppLive, AppView, Layer.empty, {
  name: 'demo:opening-an-app',
});

function Shown() {
  const past = App.useRuntime().shown !== null;
  return (
    <PastContext value={past}>
      <App />
    </PastContext>
  );
}

/**
 * Opening an app as one React component, for a window on a docs page: the
 * app, its buttons off while a past Step is shown.
 */
export const OpeningAnAppApp = Object.assign(Shown, {
  useRuntime: App.useRuntime,
});
