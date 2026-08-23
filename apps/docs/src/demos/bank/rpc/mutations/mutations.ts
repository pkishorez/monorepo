import { Array as Arr, Data, Effect, Match } from 'effect';
import { nextUlid } from 'std-toolkit/core';
import type { DatabaseError, StdTableService } from 'std-toolkit/db';
import { InvalidName, normalizeName } from '../../contract/name/index.ts';
import { isValidAmount } from '../../contract/transfer/index.ts';
import {
  accountEntity,
  type AccountRow,
} from '../../std-table/entities/account/index.ts';
import {
  transferEntity,
  type TransferRow,
} from '../../std-table/entities/transfer/index.ts';
import { bankTable } from '../../std-table/table/index.ts';
import { TransferRefused } from '../../contract/refusal/index.ts';
import { BankMutations, Forbidden, Role } from '../contract/index.ts';
import type { DecodedEntity } from 'std-toolkit/core';

type BankTableService = StdTableService<'bank'>;

const stamp = <T>(row: DecodedEntity<T>): DecodedEntity<T> => ({
  ...row,
  meta: { ...row.meta, _s: Date.now() },
});

export interface OpenAccountInput {
  readonly id?: string | undefined;
  readonly name: string;
  readonly balance?: number | undefined;
}

export const openAccount = (
  input: OpenAccountInput,
): Effect.Effect<AccountRow, InvalidName, BankTableService> =>
  Effect.gen(function* () {
    const name = normalizeName(input.name);
    if (name === null) return yield* Effect.fail(new InvalidName());
    const id = input.id ?? (yield* nextUlid);
    return yield* accountEntity
      .insert({ id, name, balance: input.balance ?? 0 })
      .pipe(Effect.map(stamp), Effect.orDie);
  });

const OPEN_CONCURRENCY = 5;

export const openAccounts = (
  inputs: readonly OpenAccountInput[],
): Effect.Effect<readonly AccountRow[], never, BankTableService> =>
  Effect.forEach(inputs, (input) => openAccount(input).pipe(Effect.option), {
    concurrency: OPEN_CONCURRENCY,
  }).pipe(Effect.map(Arr.getSomes));

export interface TransferInput {
  readonly id?: string | undefined;
  readonly from: string;
  readonly to: string;
  readonly amount: number;
}

export interface TransferOutcome {
  readonly transfer: TransferRow;
  readonly accounts: readonly AccountRow[];
}

class Contention extends Data.TaggedError('Contention')<{}> {}

const refuse = (reason: TransferRefused['reason']) =>
  Effect.fail(new TransferRefused({ reason }));

const attemptTransfer = (
  id: string,
  from: string,
  to: string,
  amount: number,
) =>
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

const recoverContention = (error: DatabaseError) =>
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

export const transfer = (
  input: TransferInput,
): Effect.Effect<TransferOutcome, TransferRefused, BankTableService> =>
  Effect.gen(function* () {
    if (!isValidAmount(input.amount)) return yield* refuse('invalid-amount');
    if (input.from === input.to) return yield* refuse('same-account');
    const id = input.id ?? (yield* nextUlid);
    return yield* attemptTransfer(id, input.from, input.to, input.amount).pipe(
      Effect.catchTag('DatabaseError', recoverContention),
      Effect.retry({ times: 3, while: (error) => error._tag === 'Contention' }),
      Effect.catchTag('Contention', (error) => Effect.die(error)),
    );
  });

export const clearBank: Effect.Effect<void, never, BankTableService> =
  Effect.gen(function* () {
    yield* accountEntity.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING');
    yield* transferEntity.dangerouslyRemoveAllItems('I KNOW WHAT I AM DOING');
  }).pipe(Effect.orDie);

const requireAdmin = Effect.flatMap(Role, (role) =>
  role === 'admin' ? Effect.void : Effect.fail(new Forbidden()),
);

export const BankMutationsLive = BankMutations.toLayer({
  openAccounts: ({ accounts }) =>
    requireAdmin.pipe(Effect.andThen(openAccounts(accounts))),
  transfer: ({ id, from, to, amount }) => transfer({ id, from, to, amount }),
  clear: () => requireAdmin.pipe(Effect.andThen(clearBank)),
  session: () => Effect.map(Role, (role) => ({ role })),
});
