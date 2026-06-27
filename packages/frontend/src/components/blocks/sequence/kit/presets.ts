/**
 * Entry/exit animation presets — the only sanctioned source of
 * `initial`/`animate`/`exit` values for a sequence scene. Authors pick a preset
 * name instead of hand-writing motion variants, so every scene enters and exits
 * with the same vetted feel. Durations are NOT encoded here: they come from
 * `<Screen speed>` via the shared transition context, so a preset is tempo-free.
 *
 * Exits are opacity-dominant by design: a nested element has its own presence
 * lifecycle and cannot lean on the parent's layout projection, so its exit must
 * not depend on a layout-coupled transform settling.
 */

/** Enter preset → the `{ initial, animate }` pair an element mounts with. */
export const enter = {
  /** Pure cross-fade. Captions, frames, anything that should just appear. */
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 } },
  /** The text feel: fade up a few px into place. Use for any animated text. */
  text: { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 } },
  /** A gentle pop. Titles, cards, bars — a slight scale settle. */
  pop: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
  },
  /** Grow from nothing. Dots, badges, things that materialise. */
  scale: {
    initial: { opacity: 0, scale: 0 },
    animate: { opacity: 1, scale: 1 },
  },
  /** The bigger nudge: fade up further + scale settle. Hero boxes, tiles. */
  rise: {
    initial: { opacity: 0, y: 24, scale: 0.85 },
    animate: { opacity: 1, y: 0, scale: 1 },
  },
} as const;

/** Exit preset → the `exit` variant an element leaves with (opacity-dominant). */
export const exit = {
  fade: { opacity: 0 },
  text: { opacity: 0, y: -6 },
  pop: { opacity: 0, scale: 0.9 },
  scale: { opacity: 0, scale: 0 },
} as const;

export type EnterPreset = keyof typeof enter;
export type ExitPreset = keyof typeof exit;

/**
 * Index-based stagger delay for list orchestration: spread a row of siblings so
 * they cascade instead of snapping in together. Spread onto an element's
 * `transition` (e.g. `transition={{ ...stagger(i) }}`).
 */
export const stagger = (i: number, step = 0.08) => ({ delay: i * step });
