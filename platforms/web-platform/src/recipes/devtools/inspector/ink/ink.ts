import type { CSSProperties } from 'react';

/*
 * The Inspector's colours: one name per thing the Map shows, each a CSS
 * custom property set once on the Inspector and read everywhere below it.
 *
 * Built on the Theme: lit is the foreground, dim and lines are the
 * foreground thinned, active is the Theme's positive and failed its
 * destructive. The three it lacks, running, message and command, are written
 * here in OKLCH as `light-dark()` pairs, so they follow the Theme's
 * `color-scheme` with no class of their own: darker and more vivid on a
 * light ground, lighter and calmer on a dark one.
 */

/** Everything the Map colours, by what it means. */
const TONES = {
  /** What runs, or the State an Instance is in. */
  lit: 'var(--foreground)',
  /** What only could run. */
  dim: 'color-mix(in oklch, var(--foreground) 32%, transparent)',
  /** A Link to something dim. */
  line: 'color-mix(in oklch, var(--foreground) 14%, transparent)',
  /** A Link to something lit. */
  'line-lit': 'color-mix(in oklch, var(--foreground) 42%, transparent)',
  /** The State an Instance is in. */
  active: 'var(--positive)',
  'active-soft': 'light-dark(oklch(0.95 0.045 145), oklch(0.32 0.07 145))',
  /** A Worker at work. */
  running: 'light-dark(oklch(0.58 0.12 205), oklch(0.78 0.11 205))',
  /** A Worker that failed. */
  failed: 'var(--destructive)',
  /** The Step's Message: its Send and its Request. */
  message: 'light-dark(oklch(0.55 0.2 262), oklch(0.74 0.14 262))',
  'message-soft': 'light-dark(oklch(0.95 0.03 262), oklch(0.3 0.07 262))',
  /** A Command the Step's Update asked for. */
  command: 'light-dark(oklch(0.62 0.15 60), oklch(0.8 0.13 70))',
  'command-soft': 'light-dark(oklch(0.96 0.04 70), oklch(0.32 0.06 65))',
  /** Its dot grid. */
  grain: 'color-mix(in oklch, var(--foreground) 9%, transparent)',
} as const;

export type Tone = keyof typeof TONES;

/** The custom properties to set on the Inspector, once. */
export const INK = Object.fromEntries(
  Object.entries(TONES).map(([tone, value]) => [`--kabuki-${tone}`, value]),
) as CSSProperties;

/** A tone, as a CSS value to use anywhere below the Inspector. */
export const ink = (tone: Tone) => `var(--kabuki-${tone})`;

/** Every tone, for a swatch. */
export const TONE_NAMES = Object.keys(TONES) as ReadonlyArray<Tone>;
