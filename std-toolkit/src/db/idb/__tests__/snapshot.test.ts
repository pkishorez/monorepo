import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, SingleEntityESchema } from '../../../eschema/index.js';
import { Snapshot } from '../../../snapshot/index.js';
import { IdbTable } from '../src/index.js';

const userSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  teamId: Schema.String,
}).build();

const settingsSchema = SingleEntityESchema.make('Settings', {
  theme: Schema.String,
}).build();

function makeSnapshot(singletonDefault = 'light', reverse = false) {
  const table = IdbTable.make()
    .primary('pk', 'sk')
    .index('ByTeam', 'teamPk', 'teamSk')
    .index('ByEmail', 'emailPk', 'emailSk')
    .build();
  const addUser = () =>
    table
      .entity(userSchema)
      .primary({ pk: ['teamId', 'email'] })
      .index('ByTeam', 'byTeam', {
        pk: ['teamId'],
        sk: ['email', '_u'],
      })
      .index('ByEmail', 'byEmail', { pk: ['email', 'teamId'] })
      .build();
  const addSettings = () =>
    table.singleEntity(settingsSchema).default({ theme: singletonDefault });
  if (reverse) {
    addSettings();
    addUser();
  } else {
    addUser();
    addSettings();
  }
  return table.snapshot();
}

describe('IdbTable.snapshot', () => {
  it('captures sparse physical topology and complete entity contracts', () => {
    const snapshot = makeSnapshot();

    expect(snapshot).toMatchObject({
      _v: 'v1',
      kind: 'table',
      adapter: 'idb',
      primaryIndex: { pk: 'pk', sk: 'sk' },
      secondaryIndexes: [
        { name: 'ByEmail', kind: 'sparse', pk: 'emailPk', sk: 'emailSk' },
        { name: 'ByTeam', kind: 'sparse', pk: 'teamPk', sk: 'teamSk' },
      ],
      entities: [
        {
          name: 'Settings',
          kind: 'singleton',
          idField: null,
          schema: 'Settings',
          primaryDerivation: { pk: [], sk: [] },
          secondaryDerivations: [],
        },
        {
          name: 'User',
          kind: 'keyed',
          idField: 'userId',
          schema: 'User',
          primaryDerivation: {
            pk: ['teamId', 'email'],
            sk: ['userId'],
          },
          secondaryDerivations: [
            {
              name: 'byEmail',
              physicalIndex: 'ByEmail',
              pk: ['email', 'teamId'],
              sk: ['_u'],
            },
            {
              name: 'byTeam',
              physicalIndex: 'ByTeam',
              pk: ['teamId'],
              sk: ['email', '_u'],
            },
          ],
        },
      ],
    });
    expect(snapshot.schemas.map(({ identity }) => identity)).toEqual([
      'Settings',
      'User',
    ]);
  });

  it('excludes singleton defaults and entity registration order', () => {
    expect(makeSnapshot('dark', true)).toEqual(makeSnapshot('light', false));
  });

  it('supports pure inspection and comparison without IndexedDB', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new Error('IndexedDB must not be accessed');
      },
    });

    try {
      const snapshot = makeSnapshot();
      expect(Snapshot.inspect(snapshot)).toEqual([]);
      expect(Snapshot.diff(snapshot, makeSnapshot())).toEqual([]);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'indexedDB', descriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'indexedDB');
      }
    }
  });
});
