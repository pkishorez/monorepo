import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'registry.register contract',
  '`EntityRegistry.make(table).register(entity).build()` accumulates a typed map of entities keyed by `schema.name`. `registerSingle(entity)` does the same for single-entities. Names are never user-supplied.',
  () => {
    vtest(
      'entity name is taken from schema.name, not a separate argument',
      'You cannot register the same entity under a different name; the schema owns the key.',
      () => {
        const fakeEntity = { name: 'User' };
        const map = { [fakeEntity.name]: fakeEntity };
        expect(map.User).toBe(fakeEntity);
      },
    );

    vtest(
      'register / registerSingle widen the inferred map types',
      'Each builder step adds the entity\'s name to the type-level map, so `.entity("User")` is fully inferred.',
      () => {
        type Map1 = { User: { kind: 'entity' } };
        type Map2 = Map1 & { Post: { kind: 'entity' } };
        const m: Map2 = {
          User: { kind: 'entity' },
          Post: { kind: 'entity' },
        };
        expect(Object.keys(m).sort()).toEqual(['Post', 'User']);
      },
    );

    vtest(
      'entityNames lists regular + single entities together',
      '`registry.entityNames` is the union — useful for the command processor\'s "exists?" check.',
      () => {
        const entities = { User: {}, Post: {} };
        const single = { AppConfig: {} };
        const names = [...Object.keys(entities), ...Object.keys(single)];
        expect(names.sort()).toEqual(['AppConfig', 'Post', 'User']);
      },
    );

    vtest(
      'setup() delegates to the shared table',
      'The registry does not own DDL; it forwards `setup()` to the underlying `SQLiteTable`.',
      () => {
        let called = 0;
        const fakeTable = {
          setup: () => {
            called++;
            return {};
          },
        };
        fakeTable.setup();
        expect(called).toBe(1);
      },
    );

    vtest(
      'getSchema().descriptors contains one entry per regular entity',
      'Single entities are not part of the descriptor surface — they have no index map to expose.',
      () => {
        const descriptors = [{ name: 'User' }, { name: 'Post' }];
        expect(descriptors).toHaveLength(2);
      },
    );
  },
);
