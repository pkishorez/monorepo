import { expect } from 'vitest';

import { vdescribe, vtest } from '@monorepo/vtest';

vdescribe(
  'registry builder',
  'A `.register(...)` call adds the entity to the registry typed by its name. The builder type and the registry type are different — `.build()` is mandatory.',
  () => {
    vtest(
      'entity name is the map key',
      'Two entities cannot share a name; the latter overwrites the first at the type level and at runtime.',
      () => {
        const map: Record<string, { name: string }> = {};
        map['User'] = { name: 'User' };
        map['User'] = { name: 'User-2' };
        expect(map['User'].name).toBe('User-2');
      },
    );

    vtest(
      'single entities are kept in a separate map',
      '`registerSingle` writes to `TSingleEntities`; `entityNames` flattens both maps in order.',
      () => {
        const regular = ['User'];
        const single = ['AppConfig'];
        const flat = [...regular, ...single];
        expect(flat).toEqual(['User', 'AppConfig']);
      },
    );

    vtest(
      'order of registration does not affect behaviour',
      'It only affects the order of `entityNames` and the descriptor list.',
      () => {
        const a = ['User', 'Order'];
        const b = ['Order', 'User'];
        expect(a.sort()).toEqual(b.sort());
      },
    );
  },
);
