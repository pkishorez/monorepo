/*
 * The few class lists the landing page's parts share: its column, the
 * focus ring every control draws, and its two kinds of button.
 */

export const COLUMN = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

export const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--dn-focus)';

export const BUTTON = {
  solid: `inline-flex h-11 items-center gap-2 rounded-xl bg-(--dn-accent) px-4 text-sm font-semibold text-(--dn-accent-ink) transition-[background-color,transform] duration-150 hover:bg-(--dn-accent-hover) active:scale-[0.97] ${FOCUS}`,
  ghost: `inline-flex h-11 items-center gap-2 rounded-xl border border-(--dn-line) px-4 text-sm font-medium text-(--dn-text) transition-[background-color,transform] duration-150 hover:bg-(--dn-raised) active:scale-[0.97] ${FOCUS}`,
};

/** A section's small heading over its title. */
export const EYEBROW =
  'font-mono text-xs tracking-wide text-(--dn-accent-text)';
