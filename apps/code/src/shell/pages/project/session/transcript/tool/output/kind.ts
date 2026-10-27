import type { ComponentType } from 'react';
import type { Opening } from '../../fold/index.ts';
import type { Row } from '../../rows/index.ts';

/** One tool call, as each kind is handed it to draw. */
export type DetailProps = {
  readonly row: Extract<Row, { readonly kind: 'tool' }>;
  readonly opening: Opening;
  /** The project's folder, so paths inside it read short. */
  readonly folder: string | null;
};

/** What each kind of tool is: its icon, and what it shows when opened. */
export type Kind = {
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly Detail: ComponentType<DetailProps>;
};
