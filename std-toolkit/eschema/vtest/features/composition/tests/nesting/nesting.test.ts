import { ESchema, ValueESchema, toSchema } from '@std-toolkit/eschema';
import { Effect, Schema } from 'effect';
import { vdescribe, vtest } from '@monorepo/vtest';

const Address = ESchema.make({
  street: Schema.String,
  city: Schema.String,
}).build();

const Status = ValueESchema.make(Schema.Literals(['draft', 'published']))
  .evolve('v2', Schema.Literals(['draft', 'review', 'published']), (v) => v)
  .build();

const Ticket = ESchema.make({
  title: Schema.String,
  status: toSchema(Status, { name: 'Status' }),
  addresses: Schema.Array(toSchema(Address, { name: 'Address' })),
}).build();

vdescribe(
  'nested schemas version independently of the parent',
  'every level carries its own _v and folds through its own chain',
  () => {
    vtest(
      'each level gets its own version stamp on encode',
      'parent, value envelope, and array elements all version separately',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const encoded = yield* Ticket.encode({
              title: 'Fix billing',
              status: 'review',
              addresses: [{ street: '123 Main', city: 'NYC' }],
            });
            if (encoded._v !== 'v1') throw new Error('parent should be v1');
            const status = encoded.status as { _v: string; value: string };
            if (status._v !== 'v2' || status.value !== 'review') {
              throw new Error('nested status envelope wrong');
            }
            const addr = encoded.addresses[0] as { _v: string };
            if (addr._v !== 'v1')
              throw new Error('nested address should be v1');
          }),
        ),
    );

    vtest(
      'a bare nested legacy value still decodes through its own chain',
      'children fold forward on their own, even from a bare value',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const decoded = yield* Ticket.decode({
              _v: 'v1',
              title: 'Old ticket',
              status: 'draft',
              addresses: [{ street: '1 First', city: 'LA' }],
            });
            if (decoded.status !== 'draft') {
              throw new Error('bare nested value did not decode');
            }
          }),
        ),
    );
  },
);
