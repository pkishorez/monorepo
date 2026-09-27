import type { Projection } from '@kstackz/flow';

/** The Projection of one Journal: the only shape the swim lane renders. */
export type RecordedFlow = Projection;
export type RecordedFlowItem = Projection['items'][number];
