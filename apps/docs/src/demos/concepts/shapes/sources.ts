import type { Entry } from 'effect-oak';

/** Who Sent a Message: a View, a Command, a Worker or a Provide; code outside the tree; or a Restore, which no one Sent. */
export type Source = Entry['source']['kind'];

/**
 * The fixed Source colours, from the theme's chart palette: a Marble, a Ring
 * and a Path are drawn in the colour of their Source. A Restore, given to
 * the app rather than Sent, and a Message from outside the tree take the
 * View's; a Provide, which works like a Worker, takes the Worker's.
 */
export const SOURCE: Record<Source, { readonly color: string }> = {
  view: { color: 'var(--chart-6)' },
  command: { color: 'var(--chart-7)' },
  worker: { color: 'var(--chart-8)' },
  provide: { color: 'var(--chart-8)' },
  outside: { color: 'var(--chart-6)' },
  restore: { color: 'var(--chart-6)' },
};
