import { Console, Effect } from 'effect';
import { History, Runtime } from '@kestack/kabuki';
import { SketchLive } from '../components/sketch.ts';

export const program = Effect.gen(function* () {
  // A Runtime keeps no History. Keep one beside it: make the Runtime
  // stopped, add every entry it plays, then start it.
  const app = yield* Runtime.scoped(SketchLive, { running: false });
  let history = History.init(app.snapshot);
  app.subscribe((entries) => {
    history = History.add(history, entries);
  });
  yield* Effect.promise(() => app.start());

  const sketch = app.root;
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
    History.entries(history).map((entry) => entry.message),
  );

  // The Snapshot right after the first entry: the History plays the
  // Messages up to it again. A look only: the app stays where it is.
  const [first] = History.entries(history);
  const past = History.snapshot(SketchLive, history, first.id);
  yield* Console.log('after the first', seen(past.root));

  // To carry on from there, move the History's Head back, and have the
  // same Runtime follow the Snapshot at it.
  history = History.move(history, first.id);
  yield* Effect.promise(() =>
    app.follow(History.snapshot(SketchLive, history), { restart: true }),
  );
  yield* Console.log('followed', seen(sketch));

  // A new Message grows a new Branch. The old one stays.
  sketch.send({ _tag: 'Painted', cell: 2 });
  yield* Console.log('painted', seen(sketch));
  yield* Console.log(
    'what follows it',
    History.children(history, first.id).map((entry) => entry.message),
  );

  // Saved, the History is plain JSON: its start, every entry, and its Head.
  const saved = History.save(SketchLive, history);
  return { entries: saved.entries.length, head: saved.head };
});
