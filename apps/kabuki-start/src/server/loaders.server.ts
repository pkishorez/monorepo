import { Clock, Effect } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Start } from '@kestack/kabuki/start/server';
import { router } from '../shared/pages/index.ts';

/*
 * One Loader per page with data. The rendering pages say when they ran;
 * the list of items is fixed; an item takes a second, so a preload has
 * something to save, and an id with no item is not found. Nothing here Requires a Layer.
 */

const ITEMS = [
  { id: 1, name: 'Lantern' },
  { id: 2, name: 'Compass' },
  { id: 3, name: 'Telescope' },
];

const ran = Effect.map(Clock.currentTimeMillis, (at) => ({ at }));

const loaders = router.loaders({
  Static: () => ran,
  'Static.Dynamic': () => ran,
  'Static.Dynamic.Client': () => ran,
  Items: () => Effect.succeed({ items: ITEMS }),
  'Items.Item': ({ id }) =>
    Effect.gen(function* () {
      yield* Effect.sleep('1 second');
      const item = ITEMS.find((each) => each.id === id);
      if (item === undefined) return yield* Page.notFound();
      return { ...item, at: yield* Clock.currentTimeMillis };
    }),
});

export default Start.server(loaders);
