import type { CSSProperties } from 'react';

/*
 * The shell is drawn from two values, both 0 to 1: `--sidebar-open`, how open
 * the sidebar is, and `--sidebar-mobile`, how much the layout is a phone's.
 * Everything else is a formula of them, so the same formulas swipe the
 * sidebar open on a phone, push the page on a wide screen, and morph one into
 * the other as the screen crosses the breakpoint.
 *
 * They move only what is painted. Sizes follow the breakpoint itself, in the
 * classes, so the page reflows once as the screen crosses it, never while it
 * morphs.
 */

/** The values the shapes below read, derived from the two. */
export const DERIVED: Record<string, string> = {
  // How far the page is lifted off the sidebar, a phone's look: shrunk,
  // rounded and dimmed. Never on a wide screen.
  '--sidebar-lift': 'calc(var(--sidebar-open) * var(--sidebar-mobile))',
  // How far the page moves aside: a phone's sidebar width or a wide screen's.
  '--sidebar-push':
    'calc(var(--sidebar-width-mobile) * var(--sidebar-mobile) + var(--sidebar-width) * (1 - var(--sidebar-mobile)))',
  // The margin round the page, a card on a wide screen.
  '--sidebar-gap': 'calc(0.5rem * (1 - var(--sidebar-mobile)))',
};

/**
 * The two values before the motion takes over, by the breakpoint: a phone
 * starts shut, a wide screen as the markup says.
 */
export const FIRST_PAINT =
  '[--sidebar-mobile:1] [--sidebar-open:0] md:[--sidebar-mobile:0] md:data-[state=open]:[--sidebar-open:1]';

/** The sidebar, under the page, sliding in and fading up as it opens. */
export const SIDEBAR_STYLE: CSSProperties = {
  translate: 'calc((var(--sidebar-open) - 1) * 20%)',
  opacity: 'var(--sidebar-open)',
};

/** The page: moved aside by the sidebar, lifted on a phone, a card when wide. */
export const PAGE_STYLE: CSSProperties = {
  flex: 'none',
  translate:
    'calc(var(--sidebar-open) * var(--sidebar-push) + (1 - var(--sidebar-open)) * var(--sidebar-gap)) var(--sidebar-gap)',
  scale: 'calc(1 - 0.08 * var(--sidebar-lift))',
  transformOrigin: 'left center',
  borderRadius:
    'calc(var(--sidebar-lift) * 2rem + (1 - var(--sidebar-mobile)) * 0.75rem)',
};

/**
 * The page's size: a phone's is the whole screen, pushed aside; a wide one's
 * is what the sidebar leaves, less the card's margin.
 */
export const PAGE_SIZE =
  'w-full md:h-[calc(100%-1rem)] md:w-[calc(100%-var(--sidebar-open)*var(--sidebar-width)-(2-var(--sidebar-open))*0.5rem)]';

/** The dim over the page, by how lifted it is. */
export const SCRIM =
  'opacity-[calc(var(--sidebar-lift)*0.3)] dark:opacity-[calc(var(--sidebar-lift)*0.5)]';
