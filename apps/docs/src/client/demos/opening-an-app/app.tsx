import { View } from '@kestack/kabuki/react';
import { AppView, PastContext } from './screens/index.ts';

const App = View.app(AppView, { name: 'demo:opening-an-app' });

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
