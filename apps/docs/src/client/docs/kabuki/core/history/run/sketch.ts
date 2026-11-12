import { Console, Effect } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { SketchLive } from '../components/sketch.ts';

export const program = Effect.gen(function* () {
  // A Runtime keeps a History of every Message it is sent.
  const app = yield* Runtime.scoped(SketchLive);
  const sketch = app.instance({ from: 'docs' });
  // The colour picked, and the first row of cells, to keep each line short.
  const seen = ({ model }: { readonly model: typeof sketch.model }) => ({
    colour: model.colour,
    row: model.cells.slice(0, 5),
  });

  sketch.send({ _tag: 'Painted', cell: 0 });
  sketch.send({ _tag: 'Picked', colour: 'rose' });
  sketch.send({ _tag: 'Painted', cell: 1 });
  yield* Console.log('now', seen(sketch));
  yield* Console.log(
    'kept',
    History.line(app.history).map((entry) => entry.message),
  );

  // Seek the first entry: kabuki plays the Messages up to it again, as a
  // Step. A look only: the app stays where it is.
  const [first] = History.line(app.history);
  const step = app.seek(first.id);
  yield* Console.log('Step 1', seen(step.snapshot.root));

  // Fork to carry on from there: the same Runtime, its Head moved back.
  yield* Effect.promise(() => app.fork(first.id));
  const back = app.instance({ from: 'docs' });
  yield* Console.log('fork', seen(back));

  // A new Message grows a new Branch. The old one stays.
  back.send({ _tag: 'Painted', cell: 2 });
  yield* Console.log('painted', seen(back));
  yield* Console.log(
    'after Step 1',
    History.children(app.history, first.id).map((entry) => entry.message),
  );

  // Saved, the History is plain JSON: every entry, and its Head.
  const saved = History.save(SketchLive, app.history);
  return { entries: saved.entries.length, head: saved.head };
});
