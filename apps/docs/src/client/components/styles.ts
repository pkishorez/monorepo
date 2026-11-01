/*
 * The few classes the pages and the layout share.
 */

/** The column every part of the page lines up on: wide, for the docs' three columns. */
export const column = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';

/** A link in running text. */
export const link =
  'text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground';

/**
 * A small label over a group: a section in the sidebar, a part of a page.
 * Never uppercase, so a package's name keeps its lowercase.
 */
export const label = 'text-xs font-medium text-muted-foreground';

/** A row in a nav list; the current one says `aria-current`. */
export const navRow =
  'flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground';
