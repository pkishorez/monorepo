import type { ComponentType } from 'react';

/**
 * One thing to choose: its name, its icon, what choosing it does, and the
 * choices inside it. A choice with none to do is only a way in to its own.
 * How a swipe walks a tree of them is use-gesture's Tree Walk.
 */
export type Choice = {
  readonly id: string;
  readonly label: string;
  readonly icon?: ComponentType<{ readonly className?: string }>;
  readonly onSelect?: () => void;
  readonly children?: ReadonlyArray<Choice>;
};
