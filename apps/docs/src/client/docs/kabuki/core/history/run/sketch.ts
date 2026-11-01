import { Console, Effect } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { SketchLive } from '../components/sketch.ts';

export const program = Effect.gen(function* () {
  // A History that keeps every Message, and a Runtime that runs on it.
  const history = History.make(SketchLive);
  const app = yield* Runtime.start(history);
  const sketch = app.instance({ from: 'docs' });
  // The colour picked, and the first row of cells, to keep each line short.
  const seen = ({ model }: typeof sketch) => ({
    colour: model.colour,
    row: model.cells.slice(0, 5),
  });

  sketch.send({ _tag: 'Painted', cell: 0 });
  sketch.send({ _tag: 'Picked', colour: 'rose' });
  sketch.send({ _tag: 'Painted', cell: 1 });
  yield* Console.log('live', seen(sketch));
  yield* Console.log(
    'kept',
    history.branch().map((entry) => entry.message),
  );

  // Start again from the first entry: kabuki replays the Messages up to it.
  const [first] = history.branch();
  yield* app.start(first.id);
  // The app started over, so reach it again.
  const back = app.instance({ from: 'docs' });
  yield* Console.log('Step 1', seen(back));

  // A new Message grows a new Branch. The old one stays.
  back.send({ _tag: 'Painted', cell: 2 });
  yield* Console.log('live', seen(back));
  yield* Console.log(
    'after Step 1',
    history.children(first.id).map((entry) => entry.message),
  );

  // Saved, the History is plain JSON: every entry, and its Head.
  const saved = history.save();
  return { entries: saved.entries.length, head: saved.head };
});
