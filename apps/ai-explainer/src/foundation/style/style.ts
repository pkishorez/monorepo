import type { CSSProperties } from 'react';
import { Easing } from 'remotion';
import { glide } from '../canvas/index.ts';

export type StyleName = 'blueprint' | 'paper' | 'bold';

// One way of drawing a Walkthrough. A Style changes colour, type and how the
// camera moves, never what is shown or when: every Style shares one timing.
export type Style = {
  name: StyleName;
  // Theme variables painted on the stage: the board, its dots, cards, text.
  vars: CSSProperties;
  font: { label: string; body: string; mono: string };
  // A Shiki theme for code cards; its background is replaced by the card's.
  code: 'github-light' | 'vitesse-dark' | 'one-dark-pro';
  // Camera moves take `seconds` times as long and push in `punch` times as
  // far, along `easing`.
  pace: { seconds: number; punch: number; easing: (t: number) => number };
  // One colour per chapter, in order; repeats when chapters outnumber it.
  hues: string[];
};

const sans = "'Inter Variable', ui-sans-serif, system-ui, sans-serif";
const mono = "'JetBrains Mono Variable', ui-monospace, monospace";

const vars = (values: Record<string, string>) => values as CSSProperties;

export const styles: Record<StyleName, Style> = {
  blueprint: {
    name: 'blueprint',
    vars: vars({
      '--background': 'oklch(0.2 0.035 255)',
      '--foreground': 'oklch(0.95 0.015 235)',
      '--border': 'oklch(0.4 0.06 245 / 0.7)',
      '--muted-foreground': 'oklch(0.74 0.04 240)',
      '--surface': 'oklch(0.235 0.04 255)',
      '--surface-ink': 'oklch(0.95 0.015 235)',
      '--surface-muted': 'oklch(0.72 0.04 240)',
      '--surface-line': 'oklch(0.38 0.06 245)',
      '--surface-shadow': 'none',
      '--focus': 'oklch(0.82 0.11 215 / 0.08)',
      '--focus-edge': 'oklch(0.82 0.11 215)',
      '--caption': 'oklch(0.17 0.035 255 / 0.9)',
      '--caption-ink': 'oklch(0.96 0.01 235)',
      '--radius-card': '6px',
    }),
    font: { label: mono, body: sans, mono },
    code: 'vitesse-dark',
    pace: { seconds: 1.3, punch: 1, easing: glide },
    hues: ['oklch(0.82 0.11 215)'],
  },
  paper: {
    name: 'paper',
    vars: vars({
      '--surface': 'oklch(1 0 0)',
      '--surface-ink': 'oklch(0.145 0 0)',
      '--surface-muted': 'oklch(0.556 0 0)',
      '--surface-line': 'oklch(0 0 0 / 0.08)',
      '--surface-shadow':
        '0 1px 2px oklch(0 0 0 / 0.04), 0 4px 12px oklch(0 0 0 / 0.05), 0 16px 40px oklch(0 0 0 / 0.06)',
      '--focus': 'oklch(0.55 0.13 250 / 0.08)',
      '--focus-edge': 'oklch(0.55 0.13 250)',
      '--caption': 'oklch(0.18 0 0 / 0.84)',
      '--caption-ink': 'oklch(0.98 0 0)',
      '--radius-card': '14px',
    }),
    font: { label: sans, body: sans, mono },
    code: 'github-light',
    pace: { seconds: 1, punch: 1, easing: glide },
    hues: ['oklch(0.55 0.13 250)'],
  },
  bold: {
    name: 'bold',
    vars: vars({
      '--background': 'oklch(0.965 0.02 85)',
      '--foreground': 'oklch(0.2 0.02 60)',
      '--border': 'oklch(0.84 0.035 80)',
      '--muted-foreground': 'oklch(0.48 0.03 60)',
      '--surface': 'oklch(0.22 0.015 60)',
      '--surface-ink': 'oklch(0.97 0.01 85)',
      '--surface-muted': 'oklch(0.72 0.02 80)',
      '--surface-line': 'oklch(0.22 0.015 60)',
      '--surface-shadow': '10px 10px 0 oklch(0.2 0.02 60 / 0.12)',
      '--focus': 'oklch(1 0 0 / 0.07)',
      '--focus-edge': 'oklch(0.8 0.16 75)',
      '--caption': 'oklch(0.2 0.02 60 / 0.92)',
      '--caption-ink': 'oklch(0.98 0.01 85)',
      '--radius-card': '22px',
    }),
    font: { label: sans, body: sans, mono },
    code: 'one-dark-pro',
    pace: {
      seconds: 0.62,
      punch: 1.12,
      easing: Easing.bezier(0.86, 0, 0.12, 1),
    },
    hues: [
      'oklch(0.63 0.2 35)',
      'oklch(0.52 0.16 255)',
      'oklch(0.6 0.13 165)',
      'oklch(0.72 0.16 70)',
      'oklch(0.58 0.2 350)',
      'oklch(0.55 0.14 200)',
      'oklch(0.45 0.12 300)',
    ],
  },
};

export const hue = (style: Style, chapter: number) =>
  style.hues[chapter % style.hues.length]!;
