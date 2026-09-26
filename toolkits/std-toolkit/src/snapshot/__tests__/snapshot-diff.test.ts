import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { TableSnapshot } from '../index.js';
import { snapshotOf } from './helpers.js';

describe('Snapshot.diff', () => {
  it('reports a nested next version once as safe', () => {
    const childV1 = ESchema.make('Child', { value: Schema.String }).build();
    const before = snapshotOf(
      ESchema.make('Parent', { child: toSchema(childV1) }).build(),
    );
    const childV2 = ESchema.make('Child', { value: Schema.String })
      .evolve('v2', { count: Schema.Number }, (value) => ({
        ...value,
        count: 0,
      }))
      .build();
    const after = snapshotOf(
      ESchema.make('Parent', { child: toSchema(childV2) }).build(),
    );

    expect(TableSnapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        action: 'added',
        impact: 'safe',
        subject: expect.objectContaining({
          kind: 'version',
          name: 'Child',
          version: 'v2',
        }),
      }),
    ]);
    expect(
      TableSnapshot.diff(before, after).every((item) => item.impact === 'safe'),
    ).toBe(true);
  });

  it('reports an edit to an approved version as breaking', () => {
    const previous = snapshotOf(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const edited = snapshotOf(
      ESchema.make('Item', {
        value: Schema.String,
        extra: Schema.Number,
      }).build(),
    );

    expect(TableSnapshot.diff(previous, edited)).toEqual([
      expect.objectContaining({
        action: 'edited',
        impact: 'breaking',
        edits: [{ path: ['extra'], after: { type: 'number' } }],
      }),
    ]);
  });

  it('reports exact nested edits', () => {
    const before = snapshotOf(
      ESchema.make('Item', {
        profile: Schema.Struct({ displayName: Schema.String }),
      }).build(),
    );
    const after = snapshotOf(
      ESchema.make('Item', {
        profile: Schema.Struct({
          displayName: Schema.NullOr(Schema.String),
        }),
      }).build(),
    );

    expect(TableSnapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        action: 'edited',
        impact: 'breaking',
        edits: [
          {
            path: ['profile', 'displayName'],
            before: { type: 'string' },
            after: {
              type: 'union',
              members: [{ type: 'string' }, { type: 'null' }],
            },
          },
        ],
      }),
    ]);
  });

  it('reports a field that becomes optional', () => {
    const before = snapshotOf(
      ESchema.make('Item', {
        profile: Schema.Struct({ note: Schema.String }),
      }).build(),
    );
    const after = snapshotOf(
      ESchema.make('Item', {
        profile: Schema.Struct({ note: Schema.optionalKey(Schema.String) }),
      }).build(),
    );

    expect(TableSnapshot.diff(before, after)[0]?.edits).toEqual([
      {
        path: ['profile', 'note', 'presence'],
        before: 'required',
        after: 'optional',
      },
    ]);
  });

  it('never compares checks', () => {
    const plain = snapshotOf(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const checked = snapshotOf(
      ESchema.make('Item', {
        value: Schema.String.check(
          Schema.isMinLength(1),
          Schema.isMaxLength(9),
        ),
      }).build(),
    );
    const loosened = snapshotOf(
      ESchema.make('Item', {
        value: Schema.String.check(Schema.isMaxLength(99)),
      }).build(),
    );

    expect(TableSnapshot.diff(plain, checked)).toEqual([]);
    expect(TableSnapshot.diff(checked, loosened)).toEqual([]);
    expect(TableSnapshot.diff(checked, plain)).toEqual([]);
  });

  it('reports a retargeted entity reference as safe', () => {
    const owner = (target: string) =>
      snapshotOf(
        ESchema.make('Item', {
          ownerId: Schema.String.annotate({ entityReference: target }),
        }).build(),
      );

    expect(owner('User').schemas[0]!.versions[0]!.shape).toEqual({
      type: 'struct',
      fields: [
        {
          name: 'ownerId',
          type: { type: 'string', entityReference: 'User' },
        },
      ],
    });
    expect(TableSnapshot.diff(owner('User'), owner('Team'))).toEqual([
      expect.objectContaining({
        action: 'edited',
        impact: 'safe',
        edits: [
          {
            path: ['ownerId'],
            before: { type: 'string', entityReference: 'User' },
            after: { type: 'string', entityReference: 'Team' },
          },
        ],
      }),
    ]);
  });

  it('ignores a decoded-side change that keeps the stored shape', () => {
    const before = snapshotOf(
      ESchema.make('Item', { amount: Schema.String }).build(),
    );
    const after = snapshotOf(
      ESchema.make('Item', { amount: Schema.NumberFromString }).build(),
    );

    expect(TableSnapshot.diff(before, after)).toEqual([]);
  });

  it('reports a logical name change as breaking', () => {
    const before = snapshotOf(
      ESchema.make('First', { value: Schema.String }).build(),
    );
    const after = { ...before, logicalName: 'other' };

    expect(TableSnapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        subject: expect.objectContaining({ kind: 'table' }),
        action: 'edited',
        impact: 'breaking',
      }),
    ]);
  });

  it('classifies multiple appended versions as safe', () => {
    const before = snapshotOf(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const after = snapshotOf(
      ESchema.make('Item', { value: Schema.String })
        .evolve('v2', { second: Schema.String }, (value) => ({
          ...value,
          second: '',
        }))
        .evolve('v3', { third: Schema.String }, (value) => ({
          ...value,
          third: '',
        }))
        .build(),
    );

    expect(TableSnapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        subject: expect.objectContaining({ version: 'v2' }),
        impact: 'safe',
      }),
      expect.objectContaining({
        subject: expect.objectContaining({ version: 'v3' }),
        impact: 'safe',
      }),
    ]);
  });

  it('reports deletion and ignores migration-only and cosmetic edits', () => {
    const v2 = ESchema.make('Item', { value: Schema.String })
      .evolve('v2', { count: Schema.Number }, (value) => ({
        ...value,
        count: 0,
      }))
      .build();
    const changedMigration = ESchema.make('Item', { value: Schema.String })
      .evolve('v2', { count: Schema.Number }, (value) => ({
        ...value,
        count: 99,
      }))
      .build();
    expect(
      TableSnapshot.diff(snapshotOf(v2), snapshotOf(changedMigration)),
    ).toEqual([]);

    const cosmetic = ESchema.make('Item', {
      value: Schema.String.annotate({ title: 'Cosmetic' }),
    }).build();
    expect(
      TableSnapshot.diff(
        snapshotOf(ESchema.make('Item', { value: Schema.String }).build()),
        snapshotOf(cosmetic),
      ),
    ).toEqual([]);

    const deleted = JSON.parse(JSON.stringify(snapshotOf(v2)));
    deleted.schemas[0]!.versions = deleted.schemas[0]!.versions.slice(0, 1);
    expect(TableSnapshot.diff(snapshotOf(v2), deleted)[0]).toMatchObject({
      action: 'removed',
      impact: 'breaking',
      subject: expect.objectContaining({ kind: 'version', version: 'v2' }),
    });
  });
});
