import { View } from '@kestack/kabuki/react';
import { Stage } from '../stage/index.ts';
import { AppView, PastContext } from './screens/index.ts';

const Demo = View.app(AppView, { name: 'opening-an-app-stage' });

/** Opening an app, staged to be watched: the app over its Actors. */
export function OpeningAnAppStage() {
  const runtime = Demo.useRuntime();
  const past = runtime.shown !== null;
  return (
    <Stage runtime={runtime} past={past}>
      <div className="h-full">
        <PastContext value={past}>
          <Demo />
        </PastContext>
      </div>
    </Stage>
  );
}
