import { Schema, SchemaTransformation } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { Snapshot } from '../index.js';

describe('Snapshot.diff', () => {
  it('classifies next versions and transitive nested changes as safe', () => {
    const childV1 = ESchema.make('Child', { value: Schema.String }).build();
    const before = ESchema.make('Parent', {
      child: toSchema(childV1),
    })
      .build()
      .snapshot();
    const childV2 = ESchema.make('Child', { value: Schema.String })
      .evolve('v2', { count: Schema.Number }, (value) => ({
        ...value,
        count: 0,
      }))
      .build();
    const after = ESchema.make('Parent', {
      child: toSchema(childV2),
    })
      .build()
      .snapshot();

    expect(Snapshot.diff(before, after).map((item) => item.kind)).toEqual([
      'version-added',
      'transitive-version-added',
    ]);
    expect(
      Snapshot.diff(before, after).every(
        (item) => item.classification === 'safe',
      ),
    ).toBe(true);
  });

  it('reports encoded and decoded approved edits independently', () => {
    const previous = ESchema.make('Item', { value: Schema.String })
      .build()
      .snapshot();
    const encodedEdit = JSON.parse(JSON.stringify(previous));
    encodedEdit.schemas[0]!.versions[0]!.encoded = { changed: true };
    const decodedEdit = JSON.parse(JSON.stringify(previous));
    decodedEdit.schemas[0]!.versions[0]!.decoded = { changed: true };

    expect(Snapshot.diff(previous, encodedEdit)[0]).toMatchObject({
      kind: 'encoded-changed',
      classification: 'breaking',
    });
    expect(Snapshot.diff(previous, decodedEdit)[0]).toMatchObject({
      kind: 'decoded-changed',
      classification: 'breaking',
    });
  });

  it('reports approved transformation changes', () => {
    const before = ESchema.make('Item', {
      value: Schema.StringFromBase64,
    })
      .build()
      .snapshot();
    const after = ESchema.make('Item', { value: Schema.StringFromHex })
      .build()
      .snapshot();

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        kind: 'transformations-changed',
        classification: 'breaking',
      }),
    ]);
  });

  it('reports transformations moved between fields', () => {
    const before = ESchema.make('Item', {
      first: Schema.StringFromBase64,
      second: Schema.StringFromHex,
    })
      .build()
      .snapshot();
    const after = ESchema.make('Item', {
      first: Schema.StringFromHex,
      second: Schema.StringFromBase64,
    })
      .build()
      .snapshot();

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        kind: 'transformations-changed',
        classification: 'breaking',
      }),
    ]);
  });

  it('reports root changes as breaking', () => {
    const first = ESchema.make('First', { value: Schema.String })
      .build()
      .snapshot();
    const second = ESchema.make('Second', { value: Schema.String })
      .build()
      .snapshot();
    const before = {
      ...first,
      schemas: [...first.schemas, ...second.schemas],
    };
    const after = { ...before, root: 'Second' };

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        path: '/root',
        kind: 'root-changed',
        classification: 'breaking',
      }),
    ]);
  });

  it('classifies multiple appended versions as safe', () => {
    const before = ESchema.make('Item', { value: Schema.String })
      .build()
      .snapshot();
    const after = ESchema.make('Item', { value: Schema.String })
      .evolve('v2', { second: Schema.String }, (value) => ({
        ...value,
        second: '',
      }))
      .evolve('v3', { third: Schema.String }, (value) => ({
        ...value,
        third: '',
      }))
      .build()
      .snapshot();

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        path: '/schemas/Item/versions/v2',
        classification: 'safe',
      }),
      expect.objectContaining({
        path: '/schemas/Item/versions/v3',
        classification: 'safe',
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
    expect(Snapshot.diff(v2.snapshot(), changedMigration.snapshot())).toEqual(
      [],
    );

    const cosmetic = ESchema.make('Item', {
      value: Schema.String.annotate({ title: 'Cosmetic' }),
    }).build();
    expect(
      Snapshot.diff(
        ESchema.make('Item', { value: Schema.String }).build().snapshot(),
        cosmetic.snapshot(),
      ),
    ).toEqual([]);

    const deleted = JSON.parse(JSON.stringify(v2.snapshot()));
    deleted.schemas[0]!.versions = deleted.schemas[0]!.versions.slice(0, 1);
    expect(Snapshot.diff(v2.snapshot(), deleted)[0]).toMatchObject({
      kind: 'version-deleted',
      classification: 'breaking',
    });
  });

  it('does not emit a change for an unchanged custom transform', () => {
    const custom = Schema.String.pipe(
      Schema.decodeTo(
        Schema.Number,
        SchemaTransformation.transform({ decode: Number, encode: String }),
      ),
    );
    const snapshot = ESchema.make('Item', { value: custom }).build().snapshot();
    expect(Snapshot.inspect(snapshot)).not.toEqual([]);
    expect(Snapshot.diff(snapshot, structuredClone(snapshot))).toEqual([]);
  });
});
