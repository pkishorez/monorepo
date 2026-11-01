import { Effect } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Loading } from '@kestack/kabuki/routing/capabilities';
import { router } from './shop.ts';

const LISTED = [
  { id: 1, name: 'Lamp', price: 40 },
  { id: 2, name: 'Chair', price: 120 },
  { id: 3, name: 'Kettle', price: 35 },
  { id: 4, name: 'Clock', price: 60 },
  { id: 5, name: 'Vase', price: 25 },
];

// How long each product takes to load, in milliseconds. The Vase was
// taken down: the list still names it, but there is nothing to load.
const TAKES: Record<number, number> = { 1: 100, 2: 800, 3: 2000, 4: 300 };

// The Clock's Loader breaks the first time, so Retry has work to do.
let clockLoads = 0;

// One Loader per page with data, by its dotted name. Each is an Effect.
export const loaders = router.loaders({
  Products: () => Effect.succeed({ items: LISTED }),
  'Products.Product': ({ id }) =>
    Effect.gen(function* () {
      const item = LISTED.find((each) => each.id === id);
      const takes = TAKES[id];
      if (!item || !takes) return yield* Page.notFound();
      yield* Effect.sleep(takes);
      if (id === 4 && clockLoads++ === 0)
        return yield* Effect.die(new Error('the shelf fell over'));
      return item;
    }),
});

// The Loaders run in the page, with the Data cache in front of them.
export const loading = Loading.cached(router, Loading.memory(router, loaders));
