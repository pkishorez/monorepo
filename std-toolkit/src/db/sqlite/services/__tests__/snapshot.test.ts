import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  EntityESchema,
  SingleEntityESchema,
  toSchema,
} from '../../../../eschema/index.js';
import { Snapshot } from '../../../../snapshot/index.js';
import { SQLiteTable } from '../sqlite-table.js';

const addressSchema = EntityESchema.make('Address', 'addressId', {
  city: Schema.String,
}).build();

const userSchema = EntityESchema.make('User', 'userId', {
  address: toSchema(addressSchema),
  email: Schema.String,
  teamId: Schema.String,
}).build();

const settingsSchema = SingleEntityESchema.make('Settings', {
  theme: Schema.String,
}).build();

function makeSnapshot(singletonDefault = 'light', reverse = false) {
  const table = SQLiteTable.make()
    .primary('pk', 'sk')
    .index('ByEmail', 'emailPk', 'emailSk')
    .index('ByTeam', 'teamPk', 'teamSk')
    .build();
  const addUser = () =>
    table
      .entity(userSchema)
      .primary({ pk: ['teamId', 'email'] })
      .index('ByEmail', 'byEmail', { pk: ['email', 'teamId'] })
      .index('ByTeam', 'byTeam', {
        pk: ['teamId'],
        sk: ['email', '_u'],
      })
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

describe('SQLiteTable.snapshot', () => {
  it('captures physical topology and normalized entity derivations', () => {
    expect(makeSnapshot()).toMatchObject({
      _v: 'v1',
      kind: 'table',
      adapter: 'sqlite',
      primaryIndex: { pk: 'pk', sk: 'sk' },
      secondaryIndexes: [
        {
          name: 'ByEmail',
          kind: 'secondary',
          pk: 'emailPk',
          sk: 'emailSk',
        },
        {
          name: 'ByTeam',
          kind: 'secondary',
          pk: 'teamPk',
          sk: 'teamSk',
        },
      ],
      entities: [
        {
          name: 'Settings',
          kind: 'singleton',
          idField: null,
          primaryDerivation: { pk: [], sk: [] },
          secondaryDerivations: [],
        },
        {
          name: 'User',
          kind: 'keyed',
          idField: 'userId',
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
  });

  it('excludes singleton defaults and entity registration order', () => {
    expect(makeSnapshot('dark', true)).toEqual(makeSnapshot('light', false));
  });

  it('includes every ESchema definition and supports pure snapshot operations', () => {
    const previous = makeSnapshot();
    const current = makeSnapshot('dark', true);

    expect(previous.schemas.map(({ identity }) => identity)).toEqual([
      'Address',
      'Settings',
      'User',
    ]);
    expect(previous.schemas.every(({ versions }) => versions.length > 0)).toBe(
      true,
    );
    expect(Snapshot.inspect(current)).toEqual([]);
    expect(Snapshot.diff(previous, current)).toEqual([]);
  });
});
