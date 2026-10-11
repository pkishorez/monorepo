import type { Entry } from 'effect-oak';

/** Who Sent a Message: a View, a Command or a Worker. */
export type Source = Entry['source']['kind'];

/**
 * The three fixed Source colours, from the theme's chart palette: a Marble,
 * a Ring and a Path are drawn in the colour of their Source.
 */
export const SOURCE: Record<Source, { readonly color: string }> = {
  view: { color: 'var(--chart-6)' },
  command: { color: 'var(--chart-7)' },
  worker: { color: 'var(--chart-8)' },
};
