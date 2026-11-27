import { Effect, Option, Stream } from 'effect';
import {
  isInternalEntity,
  type ContractFailure,
  type StoredItem,
  type StoredKey,
  type StdTableContract,
} from '../contract/index.js';

const SCAN_PAGE_SIZE = 200;

const scanSegment = (
  contract: StdTableContract,
  segment: number,
  totalSegments: number,
): Stream.Stream<StoredItem, ContractFailure> =>
  Stream.paginate(undefined as StoredKey | undefined, (cursor) =>
    Effect.map(
      contract.scanItems({
        limit: SCAN_PAGE_SIZE,
        ...(cursor === undefined ? {} : { startAfter: cursor }),
        segment,
        totalSegments,
      }),
      (result) => {
        const last = result.items.at(-1);
        const next: Option.Option<StoredKey | undefined> =
          result.hasMore && last !== undefined
            ? Option.some({ pk: last.pk, sk: last.sk })
            : Option.none();
        return [result.items, next] as const;
      },
    ),
  );

/**
 * Each segment is its own paginated sub-stream; non-DynamoDB adapters answer
 * every segment but 0 with an immediate empty page, so merging never
 * duplicates rows. The internal entities' items describe the table, not its
 * rows, so a scan skips them.
 */
export const scanStream = (
  contract: StdTableContract,
  parallelism: number,
): Stream.Stream<StoredItem, ContractFailure> => {
  const totalSegments = Math.max(1, Math.trunc(parallelism));
  return Stream.mergeAll(
    Array.from({ length: totalSegments }, (_, segment) =>
      scanSegment(contract, segment, totalSegments),
    ),
    { concurrency: totalSegments },
  ).pipe(Stream.filter((item) => !isInternalEntity(item.meta._e)));
};
