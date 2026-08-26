import { Effect, Option, Stream } from 'effect';
import type {
  ContractFailure,
  EncodedItem,
  EncodedKey,
  StdTableContract,
} from '../contract/index.js';

const SCAN_PAGE_SIZE = 200;

const scanSegment = (
  contract: StdTableContract,
  segment: number,
  totalSegments: number,
): Stream.Stream<EncodedItem, ContractFailure> =>
  Stream.paginate(undefined as EncodedKey | undefined, (cursor) =>
    Effect.map(
      contract.scanItems({
        limit: SCAN_PAGE_SIZE,
        ...(cursor === undefined ? {} : { startAfter: cursor }),
        segment,
        totalSegments,
      }),
      (result) => {
        const last = result.items.at(-1);
        const next: Option.Option<EncodedKey | undefined> =
          result.hasMore && last !== undefined
            ? Option.some({ pk: last.pk, sk: last.sk })
            : Option.none();
        return [result.items, next] as const;
      },
    ),
  );

/** Each segment is its own paginated sub-stream; non-DynamoDB adapters answer every segment but 0 with an immediate empty page, so merging never duplicates rows. */
export const scanStream = (
  contract: StdTableContract,
  parallelism: number,
): Stream.Stream<EncodedItem, ContractFailure> => {
  const totalSegments = Math.max(1, Math.trunc(parallelism));
  return Stream.mergeAll(
    Array.from({ length: totalSegments }, (_, segment) =>
      scanSegment(contract, segment, totalSegments),
    ),
    { concurrency: totalSegments },
  );
};
