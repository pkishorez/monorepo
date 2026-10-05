import type { ComponentType } from 'react';

/** One thing to pick: its name and its icon. */
export type Item = {
  readonly id: string;
  readonly label: string;
  readonly icon: ComponentType<{ readonly className?: string }>;
};
