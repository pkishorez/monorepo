/*
 * The few classes the pages and the layout share.
 */

/** The content column every part of the page lines up on. */
export const column = 'mx-auto w-full max-w-6xl px-4 sm:px-6';

/** A link in running text. */
export const link =
  'font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground';

/** A row in a list that is a link as a whole. */
export const row =
  'relative isolate flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/** A pane that fills what is left of its box and scrolls on its own from the `lg` width; below it, the window scrolls. */
export const pane =
  'lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain';

/** Two panes side by side that fill the screen below the header from the `lg` width. */
export const panes =
  'lg:h-[calc(100dvh-16.5rem)] lg:min-h-96 lg:grid-rows-[minmax(0,1fr)]';

/** A small grey word in a box's header, a button's size on a phone. */
export const chip =
  'inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-background px-2 font-mono text-[11px] leading-none';
