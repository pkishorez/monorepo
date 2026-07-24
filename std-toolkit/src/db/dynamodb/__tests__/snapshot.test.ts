import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  EntityESchema,
  SingleEntityESchema,
  toSchema,
} from '../../../eschema/index.js';
import { SnapshotIdentityConflict } from '../../../snapshot/index.js';
import { DynamoTable } from '../index.js';

const userSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  teamId: Schema.String,
}).build();

const settingsSchema = SingleEntityESchema.make('Settings', {
  theme: Schema.String,
}).build();

function makeSnapshot(singletonDefault = 'light', reverse = false) {
  const table = DynamoTable.make()
    .primary('pk', 'sk')
    .gsi('ByEmail', 'emailPk', 'emailSk')
    .gsi('ActuallyLocal', 'pk', 'localSk')
    .build();
  const addUser = () =>
    table
      .entity(userSchema)
      .primary({ pk: ['teamId', 'email'] })
      .index('ByEmail', 'byEmail', { pk: ['email', 'teamId'] })
      .index('ActuallyLocal', 'byTeam', {
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

describe('DynamoTable.snapshot', () => {
  it('captures physical topology and normalized entity derivations', () => {
    expect(makeSnapshot()).toMatchObject({
      _v: 'v1',
      kind: 'table',
      adapter: 'dynamodb',
      primaryIndex: { pk: 'pk', sk: 'sk' },
      secondaryIndexes: [
        { name: 'ActuallyLocal', kind: 'gsi', pk: 'pk', sk: 'localSk' },
        { name: 'ByEmail', kind: 'gsi', pk: 'emailPk', sk: 'emailSk' },
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
              physicalIndex: 'ActuallyLocal',
              pk: ['teamId'],
              sk: ['email', '_u'],
            },
          ],
        },
      ],
    });
  });

  it('excludes defaults and registration order', () => {
    expect(makeSnapshot('dark', true)).toEqual(makeSnapshot('light', false));
  });

  it('deduplicates shared nested ESchemas and rejects identity conflicts', () => {
    const shared = EntityESchema.make('Address', 'addressId', {
      line: Schema.String,
    }).build();
    const first = EntityESchema.make('First', 'id', {
      address: toSchema(shared),
    }).build();
    const second = EntityESchema.make('Second', 'id', {
      address: toSchema(shared),
    }).build();
    const table = DynamoTable.make().primary('pk', 'sk').build();
    table.entity(first).primary().build();
    table.entity(second).primary().build();
    expect(
      table.snapshot().schemas.filter(({ identity }) => identity === 'Address'),
    ).toHaveLength(1);

    const one = EntityESchema.make('Conflict', 'id', {
      value: Schema.String,
    }).build();
    const two = EntityESchema.make('Conflict', 'id', {
      value: Schema.Number,
    }).build();
    const left = EntityESchema.make('Left', 'id', {
      nested: toSchema(one),
    }).build();
    const right = EntityESchema.make('Right', 'id', {
      nested: toSchema(two),
    }).build();
    const conflict = DynamoTable.make().primary('pk', 'sk').build();
    conflict.entity(left).primary().build();
    conflict.entity(right).primary().build();
    expect(() => conflict.snapshot()).toThrow(SnapshotIdentityConflict);
  });
});
