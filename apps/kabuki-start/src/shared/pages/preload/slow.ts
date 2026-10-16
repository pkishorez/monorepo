import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Slow as SlowData } from '../../data/index.ts';

/** A page whose Loader takes a second and a half, and whose View's code loads lazily: what a preload saves. */
export const Slow = Page.define({
  path: '/:n',
  params: { n: Schema.FiniteFromString },
  render: 'dynamic',
  data: SlowData,
  metadata: ({ n }) => ({ title: `Slow page ${n} · Kabuki Start` }),
});

export const SlowLive = Page.build(Slow);
