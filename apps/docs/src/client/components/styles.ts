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

/** The ring a control shows when the keyboard reaches it. */
export const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

const pill = `group inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-sm font-medium transition-[border-color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none ${focus}`;

/** A large rounded button: `solid` for the main way on, `outline` beside it. */
export const button = {
  solid: `${pill} bg-foreground text-background`,
  outline: `${pill} border border-border bg-background hover:border-foreground/30`,
} as const;
