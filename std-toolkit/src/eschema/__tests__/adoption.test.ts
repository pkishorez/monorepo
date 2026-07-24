import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../laymos/more-coverage.js';
import { Effect, Schema } from 'effect';
import { ESchema, EntityESchema, toSchema } from '../index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

moreCoverageDomain('ESchema', () => {
  describe('Adoption', () => {
    describe('Plain to evolving schema', () => {
      describe('top-level adoption', () => {
        itEffect('unstamped legacy row folds forward from v1 to latest', () =>
          Effect.gen(function* () {
            // A schema that was a plain { name } struct before adoption,
            // then wrapped as an ESchema and evolved twice.
            const User = ESchema.make('User', { name: Schema.String })
              .evolve(
                'v2',
                { name: Schema.String, email: Schema.String },
                (p) => ({
                  ...p,
                  email: 'unknown@example.com',
                }),
              )
              .evolve(
                'v3',
                {
                  name: Schema.String,
                  email: Schema.String,
                  verified: Schema.Boolean,
                },
                (p) => ({ ...p, verified: false }),
              )
              .build();

            // Legacy data persisted under the plain schema — no `_v`.
            const decoded = yield* User.decode({ name: 'Bob' });

            expect(decoded).toEqual({
              name: 'Bob',
              email: 'unknown@example.com',
              verified: false,
            });
          }),
        );

        itEffect('unstamped that does not match v1 fails loudly', () =>
          Effect.gen(function* () {
            const User = ESchema.make('User', { name: Schema.String })
              .evolve(
                'v2',
                { name: Schema.String, age: Schema.Number },
                (p) => ({
                  ...p,
                  age: 0,
                }),
              )
              .build();

            // `name` is the wrong type for v1 — no fallback, decode rejects.
            const error = yield* Effect.flip(User.decode({ name: 123 }));
            expect(error.message).toBe('Decode failed');
          }),
        );

        itEffect(
          'no-op until evolved: unstamped == latest on a v1-only schema',
          () =>
            Effect.gen(function* () {
              const User = ESchema.make('User', {
                name: Schema.String,
              }).build();

              const decoded = yield* User.decode({ name: 'Bob' });
              expect(decoded).toEqual({ name: 'Bob' });
            }),
        );
      });

      describe('adoption under composition', () => {
        // Address was a plain nested struct before being wrapped as an evolving
        // schema and evolved to add a `country` field.
        const Address = ESchema.make('Address', {
          street: Schema.String,
          city: Schema.String,
        })
          .evolve(
            'v2',
            {
              street: Schema.String,
              city: Schema.String,
              country: Schema.String,
            },
            (p) => ({ ...p, country: 'US' }),
          )
          .build();

        itEffect(
          'unstamped nested value folds forward through its own chain (parent stamped)',
          () =>
            Effect.gen(function* () {
              // Order has always been evolving (stamped), but Address was adopted
              // later: old orders carry an unstamped nested address.
              const Order = EntityESchema.make('Order', 'id', {
                customer: Schema.String,
                shippingAddress: toSchema(Address),
              }).build();

              const decoded = yield* Order.decode({
                _v: 'v1',
                id: 'o1',
                customer: 'Alice',
                shippingAddress: { street: '123 Main', city: 'NYC' },
              });

              expect(decoded).toEqual({
                id: 'o1',
                customer: 'Alice',
                shippingAddress: {
                  street: '123 Main',
                  city: 'NYC',
                  country: 'US',
                },
              });
            }),
        );

        itEffect(
          'non-isolation: nested evolution changes parent output without parent version change',
          () =>
            Effect.gen(function* () {
              // The parent itself is a single-version (v1) schema and was never
              // evolved, yet decoding folds the nested address to its latest shape.
              const Order = EntityESchema.make('Order', 'id', {
                shippingAddress: toSchema(Address),
              }).build();

              const decoded = yield* Order.decode({
                _v: 'v1',
                id: 'o1',
                shippingAddress: { street: '1 A St', city: 'LA' },
              });

              // country injected by Address's own migration, parent still v1.
              expect(decoded.shippingAddress).toEqual({
                street: '1 A St',
                city: 'LA',
                country: 'US',
              });
            }),
        );

        itEffect(
          'whole-tree pre-adoption: both parent and nested value are unstamped',
          () =>
            Effect.gen(function* () {
              const Order = EntityESchema.make('Order', 'id', {
                customer: Schema.String,
                shippingAddress: toSchema(Address),
              })
                .evolve(
                  'v2',
                  {
                    customer: Schema.String,
                    shippingAddress: toSchema(Address),
                    priority: Schema.Boolean,
                  },
                  (p) => ({ ...p, priority: false }),
                )
                .build();

              // The entire row predates adoption — neither level is stamped.
              const decoded = yield* Order.decode({
                id: 'o1',
                customer: 'Alice',
                shippingAddress: { street: '123 Main', city: 'NYC' },
              });

              expect(decoded).toEqual({
                id: 'o1',
                customer: 'Alice',
                shippingAddress: {
                  street: '123 Main',
                  city: 'NYC',
                  country: 'US',
                },
                priority: false,
              });
            }),
        );

        itEffect(
          'array of nested values at mixed adoption vintages decode independently',
          () =>
            Effect.gen(function* () {
              const Order = EntityESchema.make('Order', 'id', {
                addresses: Schema.Array(toSchema(Address)),
              }).build();

              const decoded = yield* Order.decode({
                _v: 'v1',
                id: 'o1',
                addresses: [
                  { street: 'legacy', city: 'NYC' }, // unstamped -> v1 -> v2
                  { _v: 'v2', street: 'new', city: 'LA', country: 'CA' }, // stamped
                ],
              });

              expect(decoded.addresses).toEqual([
                { street: 'legacy', city: 'NYC', country: 'US' },
                { street: 'new', city: 'LA', country: 'CA' },
              ]);
            }),
        );

        itEffect(
          'nested unstamped that does not match nested v1 fails loudly',
          () =>
            Effect.gen(function* () {
              const Order = EntityESchema.make('Order', 'id', {
                shippingAddress: toSchema(Address),
              }).build();

              const error = yield* Effect.flip(
                Order.decode({
                  _v: 'v1',
                  id: 'o1',
                  shippingAddress: { street: 123, city: 'NYC' },
                }),
              );
              expect(error.message).toBe('Decode failed');
            }),
        );
      });
    });
  });
});
