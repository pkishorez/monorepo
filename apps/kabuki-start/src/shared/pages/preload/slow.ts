import { Schema } from 'effect';
import { Route } from '@kestack/kabuki/routing';
import { Slow as SlowData } from '../../data/index.ts';

/** A page whose Loader takes a second and a half, and whose View's code loads lazily: what a preload saves. */
export const Slow = Route.page({
  path: '/:n',
  params: { n: Schema.FiniteFromString },
  render: 'dynamic',
  data: SlowData,
  metadata: ({ n }) => ({ title: `Slow page ${n} · Kabuki Start` }),
}).build({});
