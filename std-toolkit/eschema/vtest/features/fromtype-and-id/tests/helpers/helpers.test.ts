import { ESchema, fromType, id } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

type Money = { amount: number; currency: string };

const Wallet = ESchema.make({
  owner: Schema.String,
  balance: fromType<Money>(),
}).build();

const Account = ESchema.make({
  userId: id('UserId'),
  label: Schema.String,
}).build();

vdescribe(
  'fromType and id are pass-through helpers',
  'fromType carries an existing type; id names a string field',
  () => {
    vtest(
      'fromType carries a value through encode/decode untouched',
      'a fromType field trusts the data and just flows the type',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const money: Money = { amount: 100, currency: 'USD' };
            const encoded = yield* Wallet.encode({
              owner: 'Ada',
              balance: money,
            });
            const decoded = yield* Wallet.decode(encoded);
            if (
              decoded.balance.amount !== 100 ||
              decoded.balance.currency !== 'USD'
            ) {
              throw new Error('fromType did not preserve the value');
            }
          }),
        ),
    );

    vtest(
      'id behaves as a plain string field at runtime',
      'id only adds a descriptor annotation; the value is just a string',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* Account.decode({
              _v: 'v1',
              userId: 'u-123',
              label: 'primary',
            });
            if (decoded.userId !== 'u-123') {
              throw new Error('id field did not round-trip');
            }
          }),
        ),
    );
  },
);
