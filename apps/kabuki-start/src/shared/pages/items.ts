import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { about } from './metadata/index.ts';

/*
 * A list of items and the item it opens, side by side: `/items`, then
 * `/items/:id` inside it. The list is static. An item is dynamic, its
 * Loader takes a second, and its copy stays fresh for 30 seconds: what a
 * preload on hover saves, and what a return while it is fresh skips. An
 * id with no item is not found.
 */

export const Item = Page.define({
  path: '/:id',
  params: { id: Schema.FiniteFromString },
  render: 'dynamic',
  staleTime: 30_000,
  data: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    /** When its Loader ran, in ms since the epoch. */
    at: Schema.Number,
  }),
  metadata: ({ id }, item) =>
    about(
      `/items/${id}`,
      item?.name ?? `Item ${id}`,
      'An item, preloaded on hover.',
    ),
});

export const Items = Page.define({
  path: '/items',
  data: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({ id: Schema.Number, name: Schema.String }),
    ),
  }),
  pages: { Item },
  metadata: about(
    '/items',
    'Preloading',
    'Links that load the next page while you hover, so the click arrives at once.',
  ),
});

export const ItemLive = Page.build(Item);
export const ItemsLive = Page.build(Items, { pages: { Item: ItemLive } });
