/*
 * The few classes the pages and the layout share.
 */

/** The content column every part of the page lines up on. */
export const column = 'mx-auto w-full max-w-5xl px-4 sm:px-6';

/** A link in running text. */
export const link =
  'font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground';

/** A Card that is a link as a whole: it lifts its ring on hover. */
export const tile =
  'block h-full rounded-xl transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=card]]:h-full [&>[data-slot=card]]:bg-transparent [&>[data-slot=card]]:transition-shadow hover:[&>[data-slot=card]]:ring-foreground/20';

/** A page coming into its place: its loading screen, its data, or why it failed. */
export const enter = 'animate-enter';
