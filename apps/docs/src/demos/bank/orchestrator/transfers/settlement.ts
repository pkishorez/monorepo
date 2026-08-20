import { Data, Effect, Match } from 'effect';
import type { DatabaseError } from 'std-toolkit/db';
import { TransferRefused } from '../../contract/refusal/index.ts';
import {
  accountEntity,
  type AccountRow,
} from '../../std-table/entities/account/index.ts';
import {
  transferEntity,
  type TransferRow,
} from '../../std-table/entities/transfer/index.ts';
import { bankTable } from '../../std-table/table/index.ts';
import { stamp } from '../stamp/index.ts';

class Contention extends Data.TaggedError('Contention')<{}> {}

const refuse = (reason: TransferRefused['reason']) =>
  Effect.fail(new TransferRefused({ reason }));

const attempt = (id: string, from: string, to: string, amount: number) =>
  Effect.gen(function* () {
    const [sender, receiver] = yield* Effect.all([
      accountEntity.get({ id: from }).pipe(Effect.orDie),
      accountEntity.get({ id: to }).pipe(Effect.orDie),
    ]);
    if (sender === null || receiver === null)
      return yield* refuse('account-not-found');
    if (sender.value.balance < amount)
      return yield* refuse('insufficient-funds');
    const ops = yield* Effect.all([
      accountEntity.getAndUpdateOp(
        { id: from },
        (current) => ({ balance: current.balance - amount }),
        { check: (current) => current.balance >= amount },
      ),
      accountEntity.getAndUpdateOp({ id: to }, (current) => ({
        balance: current.balance + amount,
      })),
      transferEntity.insertOp({ id, from, to, amount }),
    ]);
    const written = yield* bankTable.transact(ops);
    return {
      transfer: stamp(written[2] as TransferRow),
      accounts: [
        stamp(written[0] as AccountRow),
        stamp(written[1] as AccountRow),
      ],
    };
  });

const recover = (error: DatabaseError) =>
  Match.value(error.reason).pipe(
    Match.tag(
      'CheckRefused',
      'NoItemToUpdate',
      'ItemAlreadyExists',
      'TransactFailed',
      () => Effect.fail(new Contention()),
    ),
    Match.orElse(() => Effect.die(error)),
  );

export const settle = (id: string, from: string, to: string, amount: number) =>
  attempt(id, from, to, amount).pipe(
    Effect.catchTag('DatabaseError', recover),
    Effect.retry({
      times: 3,
      while: (error) => error._tag === 'Contention',
    }),
    Effect.catchTag('Contention', (error) => Effect.die(error)),
  );
