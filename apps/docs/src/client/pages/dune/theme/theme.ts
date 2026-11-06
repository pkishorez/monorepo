import type { CSSProperties } from 'react';

/*
 * Dune's page colours, as tokens set once on its root and read with
 * Tailwind's `bg-(--dn-…)` forms. All OKLCH: lightness steps are even, so
 * each layer sits a known distance above the one below.
 *
 * Neutrals share one cool hue (265) at low chroma, so they read as designed
 * greys rather than placeholder ones, and agree with each other. Surfaces
 * get lighter as they come forward: page, stage, panels, wells, cards. The
 * accent is the brand orange taken down a fifth in chroma, so it doesn't
 * vibrate on the dark; what sits on it is dark ink, not white, which on an
 * orange this light fails contrast.
 *
 * Inside a canvas these are lit like any CSS colour, and Dune keeps their
 * hue under the light.
 */
export const THEME = {
  // Surfaces, back to front.
  '--dn-page': 'oklch(0.125 0.006 265)',
  '--dn-stage': 'oklch(0.16 0.009 265)',
  '--dn-panel': 'oklch(0.175 0.008 265)',
  '--dn-sunken': 'oklch(0.19 0.009 265)',
  '--dn-raised': 'oklch(0.225 0.012 265)',
  '--dn-raised-hover': 'oklch(0.25 0.012 265)',
  /** A control's resting fill: tracks, switches off, disabled buttons. */
  '--dn-control': 'oklch(0.32 0.012 265)',
  /** Borders: solid on dark, where an alpha white would glow. */
  '--dn-line': 'oklch(0.26 0.01 265)',

  // Text, most to least prominent. Each passes AA on the panels.
  '--dn-text': 'oklch(0.97 0.003 265)',
  '--dn-text-2': 'oklch(0.8 0.008 265)',
  '--dn-text-3': 'oklch(0.66 0.01 265)',
  /** Placeholders and disabled labels: present, not read first. */
  '--dn-text-4': 'oklch(0.54 0.01 265)',

  // The accent.
  '--dn-accent': 'oklch(0.72 0.17 50)',
  '--dn-accent-hover': 'oklch(0.77 0.15 52)',
  /** Text and icons on the accent. */
  '--dn-accent-ink': 'oklch(0.22 0.035 48)',
  /** The accent as text or an icon on a dark surface. */
  '--dn-accent-text': 'oklch(0.8 0.13 55)',
  '--dn-focus': 'oklch(0.8 0.13 55 / 0.8)',

  // Status.
  '--dn-live': 'oklch(0.78 0.15 160)',
  '--dn-warn-text': 'oklch(0.86 0.1 85)',
  '--dn-warn-surface': 'oklch(0.86 0.1 85 / 0.08)',
} as CSSProperties;

/**
 * The accent and the stage as hex, for the APIs that take only hex: a
 * Lamp's colour, lighting's floor.
 */
export const ACCENT_HEX = '#f67f2f';
export const STAGE_HEX = '#0b0d11';
