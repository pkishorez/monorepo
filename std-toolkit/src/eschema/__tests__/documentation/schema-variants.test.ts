import { Effect, Schema } from 'effect';
import { laymosDescribe, laymosTest } from 'laymos/test';
import { describe } from 'vitest';

import {
  ESchema,
  EntityESchema,
  SingleEntityESchema,
  ValueESchema,
} from '../../index.js';
import { capabilityDocumentation } from './documentation.js';

describe('ESchema', () => {
  laymosDescribe(
    'Schema variants',
    {
      description:
        'The four ESchema variants express whether data has an identity, a type name, or an object shape.',
      documentation: capabilityDocumentation(
        'All ESchema variants share versioned encoding, decoding, evolution, and a stable snapshot name. The variants exist because storage and composition need different facts. `ESchema` describes an object value. `EntityESchema` adds an identity field for keyed collections. `SingleEntityESchema` represents exactly one stored object. `ValueESchema` versions a scalar or other non-object value.',
        'Choose the narrowest variant that states the domain truth. A user in a collection is an entity because many users are distinguished by `userId`. Application settings are a single entity because the name identifies the only record. An address nested inside another object needs no storage identity. A status string is a value schema because inventing an object wrapper would add no meaning.',
        `
const User = EntityESchema.make('User', 'userId', userFields).build()
const Settings = SingleEntityESchema.make('Settings', settingsFields).build()
const Address = ESchema.make('Address', addressFields).build()
const Status = ValueESchema.make('Status', Schema.Literals(['active', 'inactive'])).build()
        `,
        'The chosen variant affects descriptors and storage integration, not the migration rules. Every variant writes `_v` and exposes `name`; only an entity exposes `idField`; and a value schema stores its value inside a versioned envelope.',
      ),
    },
    () => {
      laymosTest(
        'Versions an anonymous object without inventing storage identity.',
        {
          description:
            'A postal address is meaningful as a reusable nested object, but it is not independently stored or addressed. Plain ESchema should version the fields without adding a name or id.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const addressSchema = ESchema.make('Address', {
              street: Schema.String,
              city: Schema.String,
            }).build();

            const encoded = yield* trace(
              addressSchema.encode({ street: '1 Main Street', city: 'Pune' }),
            );

            expect(
              encoded,
              'The address receives version metadata and no synthetic identity.',
            ).toEqual({
              _v: 'v1',
              street: '1 Main Street',
              city: 'Pune',
            });
          }),
      );

      laymosTest(
        'Names and identifies an entity in a keyed collection.',
        {
          description:
            'Many users can exist, so storage needs both the entity type and the field that distinguishes one user from another.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const schema = EntityESchema.make('User', 'userId', {
              name: Schema.String,
            }).build();

            const encoded = yield* trace(
              schema.encode({ userId: 'user-1', name: 'Ada' }),
            );

            expect(
              schema.name,
              'The entity exposes the stable type name used by storage and sync.',
            ).toBe('User');
            expect(
              schema.idField,
              'The entity exposes the field that identifies one user.',
            ).toBe('userId');
            expect(
              encoded,
              'The encoded entity preserves its caller-supplied identity.',
            ).toEqual({ _v: 'v1', userId: 'user-1', name: 'Ada' });
          }),
      );

      laymosTest(
        'Names a singleton without requiring an identity field.',
        {
          description:
            'Application settings have a storage type name, but there is exactly one settings record. A caller should not have to create a meaningless settings id.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const schema = SingleEntityESchema.make('Settings', {
              theme: Schema.Literals(['light', 'dark']),
            }).build();

            const encoded = yield* trace(schema.encode({ theme: 'dark' }));

            expect(
              schema.name,
              'The singleton exposes the stable name used by its storage record.',
            ).toBe('Settings');
            expect(
              encoded,
              'The singleton is versioned without a fabricated identity field.',
            ).toEqual({ _v: 'v1', theme: 'dark' });
          }),
      );

      laymosTest(
        'Versions a scalar value through an envelope.',
        {
          description:
            'A preference can be a string rather than an object. ValueESchema keeps that honest while still carrying the version needed for future migration.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const schema = ValueESchema.make(
              'Density',
              Schema.Literals(['compact', 'comfortable']),
            ).build();

            const encoded = yield* trace(schema.encode('compact'));

            expect(
              encoded,
              'The scalar is persisted inside a versioned value envelope.',
            ).toEqual({ _v: 'v1', value: 'compact' });
          }),
      );

      laymosTest(
        'Migrates a scalar without changing it into an object schema.',
        {
          description:
            'The original preference used a boolean. The current domain uses descriptive strings. ValueESchema should migrate the scalar directly and expose the new value type.',
        },
        ({ expect, trace }) =>
          Effect.gen(function* () {
            const schema = ValueESchema.make(
              'FeaturePreference',
              Schema.Boolean,
            )
              .evolve(
                'v2',
                Schema.Literals(['enabled', 'disabled']),
                (enabled) => (enabled ? 'enabled' : 'disabled'),
              )
              .build();

            const decoded = yield* trace(
              schema.decode({ _v: 'v1', value: false }),
            );

            expect(
              decoded,
              'The historical boolean is exposed through the current scalar vocabulary.',
            ).toBe('disabled');
          }),
      );
    },
  );
});
