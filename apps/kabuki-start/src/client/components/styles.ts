/*
 * The few classes the pages and the layout share.
 */

/** The content column every part of the page lines up on. */
export const column = 'mx-auto w-full max-w-5xl px-4 sm:px-8';

/** A link in running text. */
export const link =
  'text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground';

/** A row in a list that is a link as a whole; the current one says `aria-current`. */
export const row =
  'flex min-h-9 items-center gap-3 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium';

/** A pane that fills what is left of its box and scrolls on its own from the `lg` width; below it, the window scrolls. */
export const pane =
  'lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain';

/** Two panes side by side that fill the screen below the header from the `lg` width. */
export const panes =
  'lg:h-[calc(100dvh-20rem)] lg:min-h-96 lg:grid-rows-[minmax(0,1fr)]';

/** A list that scrolls on its own: on a phone up to a height, from `lg` the whole pane. */
export const list =
  'max-h-80 overflow-y-auto overscroll-contain rounded-md border border-border p-1 lg:h-full lg:max-h-none';
