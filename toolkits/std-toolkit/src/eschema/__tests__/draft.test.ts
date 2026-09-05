import { it, describe, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { Effect, Schema } from 'effect';
import { ESchema, EntityESchema, ValueESchema, toSchema } from '../index.js';
import { Snapshot } from '../../snapshot/index.js';
import { inspectESchema } from '../domain/introspection/index.js';

describe('ESchema draft version', () => {
  itEffect(
    'decode returns the draft shape, encode writes the last published shape',
    () =>
      Effect.gen(function* () {
        const schema = EntityESchema.make('Task', 'id', {
          title: Schema.String,
        })
          .draft(
            { title: Schema.String, done: Schema.Boolean },
            {
              forward: (previous) => ({ ...previous, done: false }),
              backward: (draft) => ({ id: draft.id, title: draft.title }),
            },
          )
          .build();

        const decoded = yield* schema.decode({
          _v: 'v1',
          id: 't1',
          title: 'write tests',
        });
        expect(decoded).toEqual({
          id: 't1',
          title: 'write tests',
          done: false,
        });

        const encoded = yield* schema.encode({
          id: 't1',
          title: 'write tests',
          done: true,
        });
        expect(encoded).toEqual({ _v: 'v1', id: 't1', title: 'write tests' });
      }),
  );

  itEffect('draft types propagate through nested composition', () =>
    Effect.gen(function* () {
      const Address = ESchema.make('Address', {
        street: Schema.String,
      })
        .draft(
          { street: Schema.String, city: Schema.String },
          {
            forward: (previous) => ({ ...previous, city: 'unknown' }),
            backward: (draft) => ({ street: draft.street }),
          },
        )
        .build();
      const Status = ValueESchema.make('Status', Schema.Literal('published'))
        .draft(Schema.Literals(['published', 'draft']), {
          forward: (previous) => previous,
          backward: () => 'published' as const,
        })
        .build();
      const AddressSchema = toSchema(Address);
      const StatusSchema = toSchema(Status);
      const Profile = ESchema.make('Profile', {
        address: AddressSchema,
        status: StatusSchema,
      }).build();
      const Account = ESchema.make('Account', {
        profiles: Schema.Array(toSchema(Profile)),
      }).build();

      const decoded = yield* Account.decode({
        _v: 'v1',
        profiles: [
          {
            _v: 'v1',
            address: { _v: 'v1', street: 'Main Street' },
            status: { _v: 'v1', value: 'published' },
          },
        ],
      });
      expect(decoded).toEqual({
        profiles: [
          {
            address: { street: 'Main Street', city: 'unknown' },
            status: 'published',
          },
        ],
      });

      const draftAccount: typeof Account.Type = {
        profiles: [
          {
            address: { street: 'Main Street', city: 'New York' },
            status: 'draft',
          },
        ],
      };
      const encoded = yield* Account.encode(draftAccount);
      expect(encoded).toEqual({
        _v: 'v1',
        profiles: [
          {
            _v: 'v1',
            address: { _v: 'v1', street: 'Main Street' },
            status: { _v: 'v1', value: 'published' },
          },
        ],
      });
    }),
  );

  itEffect('a draft does not change what snapshot capture sees', () =>
    Effect.gen(function* () {
      const published = EntityESchema.make('Task', 'id', {
        title: Schema.String,
      }).build();
      const withDraft = EntityESchema.make('Task', 'id', {
        title: Schema.String,
      })
        .draft(
          { title: Schema.String, done: Schema.Boolean },
          {
            forward: (previous) => ({ ...previous, done: false }),
            backward: (draft) => ({ id: draft.id, title: draft.title }),
          },
        )
        .build();

      const before = Snapshot.capture(published);
      const after = Snapshot.capture(withDraft);
      expect(after).toEqual(before);
      expect(Snapshot.diff(before, after)).toEqual([]);
      yield* Effect.void;
    }),
  );

  itEffect(
    'introspection reports only the published evolutions, unaffected by the draft',
    () =>
      Effect.gen(function* () {
        const withDraft = EntityESchema.make('Task', 'id', {
          title: Schema.String,
        })
          .draft(
            { title: Schema.String, done: Schema.Boolean },
            {
              forward: (previous) => ({ ...previous, done: false }),
              backward: (draft) => ({ id: draft.id, title: draft.title }),
            },
          )
          .build();

        const introspection = inspectESchema(withDraft);
        expect(introspection.evolutions).toHaveLength(1);
        expect(introspection.evolutions[0]?.version).toBe('v1');
        yield* Effect.void;
      }),
  );
});
