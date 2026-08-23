import { Array, Effect, Option, Stream } from 'effect';
import { StreamCheckpoint } from '@pkishorez/effect-cloudflare/hibernating-rpc';
import type { StdTableService } from 'std-toolkit/db';
import type { AccountEntity, TransferEntity } from '../contract/index.ts';

type BankTableService = StdTableService<'bank'>;

export const checkpointed = <
  S extends typeof AccountEntity | typeof TransferEntity,
>(
  schema: S,
  cursor: S['Type'] | null,
  watch: (
    cursor: S['Type'] | null,
  ) => Stream.Stream<ReadonlyArray<S['Type']>, never, BankTableService>,
): Stream.Stream<ReadonlyArray<S['Type']>, never, BankTableService> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const checkpoint = yield* StreamCheckpoint;
      const resumed = yield* checkpoint.get(schema).pipe(Effect.orDie);
      const resumeFrom = Option.getOrElse(resumed, () => cursor);
      return watch(resumeFrom).pipe(
        Stream.tap((batch) =>
          Option.match(Array.last(batch), {
            onNone: () => Effect.void,
            onSome: (item) => checkpoint.put(item, schema).pipe(Effect.orDie),
          }),
        ),
      );
    }),
  );
