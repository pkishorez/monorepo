import { expect } from 'vitest';
import { Schema } from 'effect';

import { vdescribe, vtest } from '@monorepo/vtest';
import {
  ESchema,
  SingleEntityESchema,
  EntityESchema,
} from '@std-toolkit/eschema';

vdescribe(
  'make seeds an initial v1 schema',
  'The initial version is always `v1`; `make` returns a builder whose `.build()` produces a schema at `v1` with the user-supplied fields.',
  () => {
    vtest(
      'ESchema.make builds a v1-only schema',
      'No `.evolve()` is required to reach a usable schema.',
      () => {
        const s = ESchema.make({ theme: Schema.String }).build();
        expect(s.latestVersion).toBe('v1');
        expect(Object.keys(s.fields)).toContain('theme');
      },
    );

    vtest(
      'SingleEntityESchema.make exposes .name',
      'The name supplied to `make` is stored on the built schema and survives `.evolve()`.',
      () => {
        const s = SingleEntityESchema.make('Settings', {
          locale: Schema.String,
        }).build();
        expect(s.name).toBe('Settings');
        expect(s.latestVersion).toBe('v1');
      },
    );

    vtest(
      'EntityESchema.make exposes .name and .idField',
      'Identity is `{ name, idField }`; both are surfaced on the built schema.',
      () => {
        const s = EntityESchema.make('User', 'id', {
          name: Schema.String,
        }).build();
        expect(s.name).toBe('User');
        expect(s.idField).toBe('id');
      },
    );
  },
);

vdescribe(
  'EntityESchema auto-adds idField',
  'The id field is appended to `.fields` by the library, as `Schema.String`. The caller never declares it.',
  () => {
    vtest(
      'idField is present on .fields after make',
      'A pre-`.evolve()` schema already carries the id column on `.fields`.',
      () => {
        const s = EntityESchema.make('User', 'id', {
          name: Schema.String,
        }).build();
        expect('id' in s.fields).toBe(true);
      },
    );

    vtest(
      'idField is preserved across evolutions',
      'Each `.evolve()` re-injects the id field, even if the delta does not mention it.',
      () => {
        const s = EntityESchema.make('User', 'id', {
          name: Schema.String,
        })
          .evolve('v2', { age: Schema.Number }, (p) => ({ ...p, age: 0 }))
          .build();
        expect('id' in s.fields).toBe(true);
        expect('age' in s.fields).toBe(true);
      },
    );
  },
);

vdescribe(
  'type-level guards on field keys',
  'Underscore-prefixed keys collide with the metadata block; the id field cannot appear in the user-supplied fields. Both are rejected at compile time.',
  () => {
    vtest(
      'underscore-prefixed keys are forbidden at type level',
      'The `ForbidUnderscorePrefix<I>` constraint maps `_*` keys to a string literal type, surfacing as a TypeScript error in user code.',
      () => {
        // @ts-expect-error — `_internal` collides with the metadata namespace.
        ESchema.make({ _internal: Schema.String });
        expect(true).toBe(true);
      },
    );

    vtest(
      'EntityESchema rejects an explicit id field at type level',
      '`ForbidIdField<I, Id>` rejects any user-supplied key equal to `idField`, even though the library adds the same name itself.',
      () => {
        // @ts-expect-error — `id` is reserved as the id field.
        EntityESchema.make('X', 'id', {
          id: Schema.String,
          name: Schema.String,
        });
        expect(true).toBe(true);
      },
    );
  },
);
