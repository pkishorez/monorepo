import type { CSSProperties } from 'react';

import type {
  StateMachineClassNames,
  StateMachineEdgeRole,
  StateMachineNodeRole,
} from '../../types';

export type StylingOption =
  | 'Light'
  | 'Dark'
  | 'Ocean'
  | 'Forest'
  | 'Sunset'
  | 'Violet';

type ThemeVariables = CSSProperties & Record<`--${string}`, string>;

function roleClassNames(
  node: Record<StateMachineNodeRole, string>,
  edge: Record<StateMachineEdgeRole, string>,
): StateMachineClassNames {
  return {
    node: ({ role }) => node[role],
    edge: ({ role }) => edge[role],
  };
}

export const customClassNames = roleClassNames(
  {
    'initial-indicator': 'bg-ring ring-ring/30',
    initial: 'border-ring bg-accent ring-ring/20',
    final: 'border-foreground bg-muted',
    choice: 'border-dotted border-ring bg-accent/40',
    intermediate: 'border-muted-foreground/50 bg-card',
  },
  {
    'initial-arrow': 'stroke-ring stroke-[2.5]',
    transition: 'stroke-foreground/60 stroke-[1.5]',
  },
);

export const stylingClassNames = roleClassNames(
  {
    'initial-indicator': 'bg-foreground',
    initial: 'border-border bg-card',
    final: 'bg-card',
    choice: 'border-dotted border-primary bg-primary/5',
    intermediate: 'border-border bg-card',
  },
  {
    'initial-arrow': 'stroke-foreground stroke-[2]',
    transition: 'stroke-muted-foreground stroke-[1.5]',
  },
);

export const STYLING_PRESETS: Record<
  StylingOption,
  {
    readonly base: 'light' | 'dark';
    readonly variables?: ThemeVariables;
  }
> = {
  Light: {
    base: 'light',
  },
  Dark: {
    base: 'dark',
  },
  Ocean: {
    base: 'dark',
    variables: {
      '--background': 'oklch(0.14 0.035 240)',
      '--foreground': 'oklch(0.96 0.015 220)',
      '--card': 'oklch(0.2 0.04 238)',
      '--card-foreground': 'oklch(0.96 0.015 220)',
      '--primary': 'oklch(0.76 0.14 205)',
      '--muted': 'oklch(0.26 0.04 238)',
      '--muted-foreground': 'oklch(0.75 0.04 220)',
      '--border': 'oklch(0.76 0.08 215 / 24%)',
      '--ring': 'oklch(0.76 0.14 205)',
      '--positive': 'oklch(0.76 0.16 155)',
    },
  },
  Forest: {
    base: 'dark',
    variables: {
      '--background': 'oklch(0.15 0.025 145)',
      '--foreground': 'oklch(0.95 0.025 120)',
      '--card': 'oklch(0.21 0.035 145)',
      '--card-foreground': 'oklch(0.95 0.025 120)',
      '--primary': 'oklch(0.76 0.16 142)',
      '--muted': 'oklch(0.27 0.035 145)',
      '--muted-foreground': 'oklch(0.75 0.045 130)',
      '--border': 'oklch(0.76 0.08 142 / 22%)',
      '--ring': 'oklch(0.76 0.16 142)',
      '--positive': 'oklch(0.82 0.15 95)',
    },
  },
  Sunset: {
    base: 'light',
    variables: {
      '--background': 'oklch(0.97 0.02 65)',
      '--foreground': 'oklch(0.24 0.045 30)',
      '--card': 'oklch(0.99 0.012 65)',
      '--card-foreground': 'oklch(0.24 0.045 30)',
      '--primary': 'oklch(0.62 0.2 35)',
      '--muted': 'oklch(0.92 0.04 65)',
      '--muted-foreground': 'oklch(0.5 0.06 40)',
      '--border': 'oklch(0.75 0.08 50 / 45%)',
      '--ring': 'oklch(0.67 0.18 35)',
      '--positive': 'oklch(0.58 0.15 145)',
    },
  },
  Violet: {
    base: 'dark',
    variables: {
      '--background': 'oklch(0.15 0.035 292)',
      '--foreground': 'oklch(0.96 0.02 290)',
      '--card': 'oklch(0.21 0.045 292)',
      '--card-foreground': 'oklch(0.96 0.02 290)',
      '--primary': 'oklch(0.76 0.17 300)',
      '--muted': 'oklch(0.27 0.045 292)',
      '--muted-foreground': 'oklch(0.76 0.05 290)',
      '--border': 'oklch(0.78 0.1 300 / 24%)',
      '--ring': 'oklch(0.76 0.17 300)',
      '--positive': 'oklch(0.78 0.16 160)',
    },
  },
};
