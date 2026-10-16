import { Schema } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Slow as SlowData } from '../../data/index.ts';

/**
 * A page whose Loader takes a second and a half, and whose View's code
 * loads lazily: what a preload saves. Its data stays fresh for 30 seconds,
 * so a click after a preload, or Back to it, loads nothing again.
 */
export const Slow = Page.define({
  path: '/:n',
  params: { n: Schema.FiniteFromString },
  render: 'dynamic',
  staleTime: 30_000,
  data: SlowData,
  metadata: ({ n }) => ({ title: `Slow page ${n} · Kabuki Start` }),
});

export const SlowLive = Page.build(Slow);
