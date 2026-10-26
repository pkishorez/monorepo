import { Effect } from 'effect';
import { CloudClient } from '@kestack/connect/code';

/*
 * What the Machine List reads: the Account's list from Cloud Connect, over
 * HTTP and signed by the Account signed in.
 */

export const problemOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message) || 'Cloud Connect could not be reached'
    : 'Cloud Connect could not be reached';

/** The Account's Machines as Cloud Connect lists them now, or why it could not, answering the ask `since`. */
export const list = (since: number) =>
  CloudClient.use((client) => client.List({})).pipe(
    Effect.map((machines) => ({
      _tag: 'Fetched' as const,
      since,
      machines,
      at: Date.now(),
    })),
    Effect.catch((error) =>
      Effect.succeed({
        _tag: 'Failed' as const,
        since,
        problem: problemOf(error),
      }),
    ),
  );
