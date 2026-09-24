import {
  groupJournals,
  projectJournal,
  type Entry,
  type Projection,
} from '@pkishorez/flow';

/** Projects one Flow per Journal from every stored Entry. */
export const projectFlows = (
  items: ReadonlyArray<{ readonly entry: Entry }>,
): ReadonlyArray<Projection> =>
  [...groupJournals(items.map((item) => item.entry)).values()].map(
    projectJournal,
  );
