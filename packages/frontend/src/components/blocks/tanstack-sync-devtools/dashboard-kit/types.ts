import type { ReactNode } from 'react';
import type { InspectorCollection } from '../view-model';

export type CollectionAccordionProps = {
  collection: InspectorCollection;
  /** Active partition count, shown in the header meta. */
  activeCount: number;
  /** Idle / persisted-inactive partition count, shown in the header meta. */
  inactiveCount: number;
  /** Partitions body slot, revealed when the accordion expands. */
  children: ReactNode;
  /** Open by default. Defaults to false (collapsed). */
  defaultOpen?: boolean;
  /** Dim the whole row when the collection is idle / has no active partitions. */
  dimmed?: boolean;
  className?: string;
};
