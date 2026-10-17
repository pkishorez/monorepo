import { Layer } from 'effect';
import { toReact } from '@kestack/kabuki/react';
import { Stage } from '../stage/index.ts';
import { TodosLive } from './story.ts';
import { TodosView } from './views.tsx';

const Demo = toReact(TodosLive, TodosView, Layer.empty, {
  name: 'todos-stage',
});

/** To-dos, staged to be watched: the app over its Actors. */
export function TodosStage() {
  const runtime = Demo.useRuntime();
  return (
    <Stage runtime={runtime} past={runtime.shown !== null}>
      <div className="h-full overflow-auto">
        <Demo />
      </div>
    </Stage>
  );
}
