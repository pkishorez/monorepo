import { Effect, Schema } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import { ESchema, EntityESchema, toSchema } from '../../index.js';
import { capabilityDocumentation } from './documentation.js';

const addressSchema = ESchema.make('Address', {
  street: Schema.String,
  city: Schema.String,
})
  .evolve('v2', { country: Schema.String }, (address) => ({
    ...address,
    country: 'US',
  }))
  .build();

const orderSchema = EntityESchema.make('Order', 'orderId', {
  customer: Schema.String,
  shippingAddress: toSchema(addressSchema),
  previousAddresses: Schema.Array(toSchema(addressSchema)),
}).build();

describe('ESchema', () => {
  laymosDescribe(
    'Composition',
    {
      description:
        'Composition embeds one evolving schema inside another while preserving each schema’s independent history.',
      documentation: capabilityDocumentation(
        'Use `toSchema` when an ESchema is a field inside another Effect Schema. The nested value keeps its own version marker and migration chain. This matters because an address, money value, or line item can evolve on its own schedule without forcing every parent schema to publish a matching version.',
        'Think of the encoded value as a tree with a small version boundary at every composed ESchema node. Decoding visits those boundaries independently. A parent may remain at v1 while a nested address moves from v1 to v2; arrays can even contain elements written at different nested versions. The decoded tree is still uniformly current.',
        `
const Address = ESchema.make('Address', addressFields)
  .evolve('v2', currentAddressFields, migrateAddress)
  .build()

const Order = EntityESchema.make('Order', 'orderId', {
  shippingAddress: toSchema(Address),
}).build()
        `,
        'Independent versioning is powerful but intentionally non-isolated: changing a nested schema changes the decoded parent output even when the parent version stays the same. Name composed schemas to make descriptors and failures readable. Unstamped nested data is adopted at that nested schema’s v1 boundary.',
      ),
    },
    () => {
      laymosTest(
        'Encodes a version marker at every composed schema boundary.',
        {
          description:
            'A fresh order and its addresses are all current. Encoding should stamp the parent and each nested value so every part of the tree can evolve independently later.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const input = {
              orderId: 'order-new',
              customer: 'Ada',
              shippingAddress: {
                street: '1 Main Street',
                city: 'London',
                country: 'UK',
              },
              previousAddresses: [
                {
                  street: '2 Old Street',
                  city: 'Paris',
                  country: 'FR',
                },
              ],
            };

            const encoded = yield* trace(orderSchema.encode(input));

            expect(
              encoded,
              'The order and every address carry their own current version.',
            ).toEqual({
              _v: 'v1',
              orderId: 'order-new',
              customer: 'Ada',
              shippingAddress: {
                _v: 'v2',
                street: '1 Main Street',
                city: 'London',
                country: 'UK',
              },
              previousAddresses: [
                {
                  _v: 'v2',
                  street: '2 Old Street',
                  city: 'Paris',
                  country: 'FR',
                },
              ],
            });
          }),
      );

      laymosTest(
        'Migrates a nested value while the parent stays at its original version.',
        {
          description:
            'The order shape has not changed, but its stored address predates the country field. The nested address should migrate without requiring a new order version.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              _v: 'v1',
              orderId: 'order-old',
              customer: 'Grace',
              shippingAddress: {
                _v: 'v1',
                street: '3 First Avenue',
                city: 'New York',
              },
              previousAddresses: [],
            };

            const decoded = yield* trace(orderSchema.decode(stored));

            expect(
              decoded.shippingAddress,
              'The parent exposes the address in its independently current shape.',
            ).toEqual({
              street: '3 First Avenue',
              city: 'New York',
              country: 'US',
            });
          }),
      );

      laymosTest(
        'Decodes array elements written at different nested versions.',
        {
          description:
            'Historical collections often contain a mixture of old and new elements. Each address should begin at its own declared version, leaving current values intact while migrating only old ones.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              _v: 'v1',
              orderId: 'order-mixed',
              customer: 'Lin',
              shippingAddress: {
                _v: 'v2',
                street: '4 Current Road',
                city: 'Toronto',
                country: 'CA',
              },
              previousAddresses: [
                {
                  _v: 'v1',
                  street: '5 Historic Road',
                  city: 'Boston',
                },
                {
                  _v: 'v2',
                  street: '6 Recent Road',
                  city: 'Delhi',
                  country: 'IN',
                },
              ],
            };

            const decoded = yield* trace(orderSchema.decode(stored));

            expect(
              decoded.previousAddresses,
              'Every array element reaches the current address shape from its own version.',
            ).toEqual([
              {
                street: '5 Historic Road',
                city: 'Boston',
                country: 'US',
              },
              {
                street: '6 Recent Road',
                city: 'Delhi',
                country: 'IN',
              },
            ]);
          }),
      );

      laymosTest(
        'Adopts an unstamped nested value at the nested first version.',
        {
          description:
            'The parent was already versioned when the address was converted from a plain struct to ESchema. An old nested address without `_v` should enter the address history at v1 and migrate normally.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const stored = {
              _v: 'v1',
              orderId: 'order-adopted',
              customer: 'Margaret',
              shippingAddress: {
                street: '7 Legacy Lane',
                city: 'Chicago',
              },
              previousAddresses: [],
            };

            const decoded = yield* trace(orderSchema.decode(stored));

            expect(
              decoded.shippingAddress,
              'The unstamped nested address is adopted and migrated to v2.',
            ).toEqual({
              street: '7 Legacy Lane',
              city: 'Chicago',
              country: 'US',
            });
          }),
      );

      laymosTest(
        'Rejects a nested value that matches no known historical shape.',
        {
          description:
            'Composition does not weaken validation. An unstamped address still has to match the nested v1 schema before its migration can run.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const failure = yield* trace(
              orderSchema
                .decode({
                  _v: 'v1',
                  orderId: 'order-invalid',
                  customer: 'Invalid',
                  shippingAddress: {
                    street: 99,
                    city: 'Nowhere',
                  },
                  previousAddresses: [],
                })
                .pipe(Effect.flip),
            );

            expect(
              failure._tag,
              'Invalid nested data reports the public ESchema failure type.',
            ).toBe('ESchemaError');
            expect(
              failure.message,
              'The parent decode fails rather than inventing a nested value.',
            ).toBe('Decode failed');
          }),
      );
    },
  );
});
