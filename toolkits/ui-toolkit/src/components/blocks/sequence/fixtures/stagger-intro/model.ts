/**
 * Data model for the stagger-intro demo: the gradient hues each box cycles
 * through. Pure data — no JSX — so the scene and shell share one source.
 */

/** Tailwind gradient stops, indexed by box position. */
export const introHues = [
  'from-rose-400 to-orange-300',
  'from-sky-400 to-indigo-400',
  'from-emerald-400 to-teal-300',
  'from-violet-400 to-fuchsia-300',
  'from-amber-400 to-yellow-300',
];
