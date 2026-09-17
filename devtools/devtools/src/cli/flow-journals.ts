import { Effect } from 'effect';
import {
  groupJournals,
  projectJournal,
  type Projection,
} from '@pkishorez/flow';
import { withDevtoolsClient, type DevtoolsClient } from './client.js';

/** Reads every stored Entry and projects one Flow per Journal. */
export const withFlowProjections = <A, E>(
  url: string,
  use: (projections: ReadonlyArray<Projection>) => Effect.Effect<A, E>,
) =>
  withDevtoolsClient(url, (client: DevtoolsClient) =>
    client.ListFlowEntries({ _u: { '>': null } }).pipe(
      Effect.map(({ items }) =>
        [...groupJournals(items.map((item) => item.entry)).values()].map(
          projectJournal,
        ),
      ),
      Effect.flatMap(use),
    ),
  );
