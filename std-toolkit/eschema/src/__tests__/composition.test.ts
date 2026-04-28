import { describe, it, expect } from 'vitest';
import { Effect, Schema } from 'effect';
import {
  ESchema,
  SingleEntityESchema,
  EntityESchema,
  toSchema,
} from '../index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

const Address = ESchema.make({
  street: Schema.String,
  city: Schema.String,
}).build();

const LineItem = EntityESchema.make('LineItem', 'id', {
  name: Schema.String,
  price: Schema.Number,
}).build();

const Order = EntityESchema.make('Order', 'orderId', {
  customer: Schema.String,
  items: Schema.Array(toSchema(LineItem)),
  shippingAddress: toSchema(Address),
}).build();

describe('toSchema composition', () => {
  describe('basic composition', () => {
    itEffect('encodes parent with nested schemas', () =>
      Effect.gen(function* () {
        const encoded = yield* Order.encode({
          orderId: 'o1',
          customer: 'Alice',
          items: [
            { id: 'li1', name: 'Widget', price: 10 },
            { id: 'li2', name: 'Gadget', price: 20 },
          ],
          shippingAddress: { street: '123 Main', city: 'NYC' },
        });

        expect(encoded).toMatchObject({
          _v: 'v1',
          orderId: 'o1',
          customer: 'Alice',
        });

        const items = (encoded as any).items;
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
          _v: 'v1',
          id: 'li1',
          name: 'Widget',
          price: 10,
        });
        expect(items[1]).toMatchObject({
          _v: 'v1',
          id: 'li2',
          name: 'Gadget',
          price: 20,
        });

        const address = (encoded as any).shippingAddress;
        expect(address).toMatchObject({
          _v: 'v1',
          street: '123 Main',
          city: 'NYC',
        });
      }),
    );

    itEffect('decodes parent with nested schemas', () =>
      Effect.gen(function* () {
        const decoded = yield* Order.decode({
          _v: 'v1',
          orderId: 'o1',
          customer: 'Alice',
          items: [{ _v: 'v1', id: 'li1', name: 'Widget', price: 10 }],
          shippingAddress: { _v: 'v1', street: '123 Main', city: 'NYC' },
        });

        expect(decoded).toEqual({
          orderId: 'o1',
          customer: 'Alice',
          items: [{ id: 'li1', name: 'Widget', price: 10 }],
          shippingAddress: { street: '123 Main', city: 'NYC' },
        });
      }),
    );

    itEffect('roundtrip encode then decode', () =>
      Effect.gen(function* () {
        const original = {
          orderId: 'o1',
          customer: 'Bob',
          items: [{ id: 'li1', name: 'Widget', price: 42 }],
          shippingAddress: { street: '456 Oak', city: 'LA' },
        };

        const encoded = yield* Order.encode(original);
        const decoded = yield* Order.decode(encoded);

        expect(decoded).toEqual(original);
      }),
    );
  });

  describe('independent versioning', () => {
    const LineItemV2 = EntityESchema.make('LineItem', 'id', {
      name: Schema.String,
      price: Schema.Number,
    })
      .evolve('v2', { taxRate: Schema.Number }, (prev) => ({
        ...prev,
        taxRate: 0,
      }))
      .build();

    const OrderWithV2Items = EntityESchema.make('Order', 'orderId', {
      customer: Schema.String,
      items: Schema.Array(toSchema(LineItemV2)),
    }).build();

    itEffect('migrates nested schema independently of parent', () =>
      Effect.gen(function* () {
        const decoded = yield* OrderWithV2Items.decode({
          _v: 'v1',
          orderId: 'o1',
          customer: 'Alice',
          items: [{ _v: 'v1', id: 'li1', name: 'Widget', price: 10 }],
        });

        expect(decoded.items[0]).toEqual({
          id: 'li1',
          name: 'Widget',
          price: 10,
          taxRate: 0,
        });
      }),
    );

    itEffect('handles array elements at different nested versions', () =>
      Effect.gen(function* () {
        const decoded = yield* OrderWithV2Items.decode({
          _v: 'v1',
          orderId: 'o1',
          customer: 'Alice',
          items: [
            { _v: 'v1', id: 'li1', name: 'Old', price: 5 },
            {
              _v: 'v2',
              id: 'li2',
              name: 'New',
              price: 15,
              taxRate: 0.1,
            },
          ],
        });

        expect(decoded.items[0]).toEqual({
          id: 'li1',
          name: 'Old',
          price: 5,
          taxRate: 0,
        });
        expect(decoded.items[1]).toEqual({
          id: 'li2',
          name: 'New',
          price: 15,
          taxRate: 0.1,
        });
      }),
    );
  });

  describe('parent evolution with nested schemas', () => {
    const Child = ESchema.make({
      value: Schema.String,
    }).build();

    const Parent = ESchema.make({
      name: Schema.String,
    })
      .evolve('v2', { child: toSchema(Child) }, (prev) => ({
        ...prev,
        child: { value: 'default' },
      }))
      .build();

    itEffect('migrates parent and decodes nested in new field', () =>
      Effect.gen(function* () {
        const decoded = yield* Parent.decode({
          _v: 'v1',
          name: 'test',
        });

        expect(decoded).toEqual({
          name: 'test',
          child: { value: 'default' },
        });
      }),
    );

    itEffect('decodes latest version with nested schema', () =>
      Effect.gen(function* () {
        const decoded = yield* Parent.decode({
          _v: 'v2',
          name: 'test',
          child: { _v: 'v1', value: 'hello' },
        });

        expect(decoded).toEqual({
          name: 'test',
          child: { value: 'hello' },
        });
      }),
    );
  });

  describe('deep nesting', () => {
    const Leaf = ESchema.make({ value: Schema.String }).build();

    const Branch = ESchema.make({
      label: Schema.String,
      leaf: toSchema(Leaf),
    }).build();

    const Root = ESchema.make({
      title: Schema.String,
      branch: toSchema(Branch),
    }).build();

    itEffect('encodes and decodes three levels deep', () =>
      Effect.gen(function* () {
        const original = {
          title: 'root',
          branch: {
            label: 'mid',
            leaf: { value: 'bottom' },
          },
        };

        const encoded = yield* Root.encode(original);
        expect((encoded as any).branch.leaf._v).toBe('v1');
        expect((encoded as any).branch._v).toBe('v1');

        const decoded = yield* Root.decode(encoded);
        expect(decoded).toEqual(original);
      }),
    );
  });

  describe('all three variants compose', () => {
    const plain = ESchema.make({ x: Schema.Number }).build();
    const named = SingleEntityESchema.make('Config', {
      y: Schema.String,
    }).build();
    const entity = EntityESchema.make('Item', 'id', {
      z: Schema.Boolean,
    }).build();

    const Composite = ESchema.make({
      p: toSchema(plain),
      n: toSchema(named),
      e: toSchema(entity),
    }).build();

    itEffect('roundtrips all three nested variant types', () =>
      Effect.gen(function* () {
        const original = {
          p: { x: 42 },
          n: { y: 'hello' },
          e: { id: 'i1', z: true },
        };

        const encoded = yield* Composite.encode(original);
        const decoded = yield* Composite.decode(encoded);
        expect(decoded).toEqual(original);
      }),
    );
  });

  describe('optional nested schema', () => {
    const Child = ESchema.make({ val: Schema.String }).build();

    const WithOptional = ESchema.make({
      name: Schema.String,
      child: Schema.optionalWith(toSchema(Child), { exact: true }),
    }).build();

    itEffect('roundtrips with optional present', () =>
      Effect.gen(function* () {
        const original = { name: 'a', child: { val: 'b' } };
        const encoded = yield* WithOptional.encode(original);
        const decoded = yield* WithOptional.decode(encoded);
        expect(decoded).toEqual(original);
      }),
    );

    itEffect('roundtrips with optional absent', () =>
      Effect.gen(function* () {
        const original = { name: 'a' };
        const encoded = yield* WithOptional.encode(original);
        const decoded = yield* WithOptional.decode(encoded);
        expect(decoded).toEqual(original);
      }),
    );
  });

  describe('nested decode error', () => {
    itEffect('propagates nested validation failure', () =>
      Effect.gen(function* () {
        const result = yield* Effect.flip(
          Order.decode({
            _v: 'v1',
            orderId: 'o1',
            customer: 'Alice',
            items: [{ _v: 'v1', id: 'li1', name: 123, price: 10 }],
            shippingAddress: { _v: 'v1', street: '123', city: 'NYC' },
          }),
        );

        expect(result.message).toBe('Decode failed');
      }),
    );
  });
});
