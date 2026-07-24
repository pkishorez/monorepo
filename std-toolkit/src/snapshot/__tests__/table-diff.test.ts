import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, toSchema } from '../../eschema/index.js';
import { Snapshot, SnapshotDecodeError, type TableSnapshot } from '../index.js';

const schema = EntityESchema.make('User', 'id', {
  email: Schema.String,
}).build();

function table(): TableSnapshot {
  return {
    _v: 'v1',
    kind: 'table',
    adapter: 'dynamodb',
    primaryIndex: { pk: 'pk', sk: 'sk' },
    secondaryIndexes: [{ name: 'GSI1', kind: 'gsi', pk: 'gpk', sk: 'gsk' }],
    entities: [
      {
        name: 'User',
        kind: 'keyed',
        idField: 'id',
        schema: 'User',
        primaryDerivation: { pk: ['email'], sk: ['id'] },
        secondaryDerivations: [
          {
            name: 'byEmail',
            physicalIndex: 'GSI1',
            pk: ['email'],
            sk: ['_u'],
          },
        ],
      },
    ],
    schemas: schema.snapshot().schemas,
  };
}

function clone(): TableSnapshot {
  return structuredClone(table());
}

describe('table snapshot diff', () => {
  it('returns no changes for identical tables and sorts changes deterministically', () => {
    expect(Snapshot.diff(table(), clone())).toEqual([]);
    const current = clone() as any;
    current.primaryIndex.pk = 'nextPk';
    current.entities[0].idField = 'nextId';
    const changes = Snapshot.diff(table(), current);
    expect(changes.map(({ path }) => path)).toEqual(
      changes.map(({ path }) => path).toSorted(),
    );
    expect(
      changes.every(({ classification }) => classification === 'breaking'),
    ).toBe(true);
  });

  it('classifies primary topology and retained entity identity changes as breaking', () => {
    for (const mutate of [
      (value: any) => (value.primaryIndex.sk = 'nextSk'),
      (value: any) => (value.entities[0].idField = 'userId'),
      (value: any) => (value.entities[0].kind = 'singleton'),
      (value: any) => (value.entities[0].primaryDerivation.pk = ['id']),
    ]) {
      const current = clone() as any;
      mutate(current);
      expect(Snapshot.diff(table(), current)).toEqual([
        expect.objectContaining({ classification: 'breaking' }),
      ]);
    }
  });

  it('classifies an entity schema reference change as breaking', () => {
    const alternate = EntityESchema.make('AlternateUser', 'id', {
      email: Schema.String,
    }).build();
    const before = clone() as any;
    before.schemas.push(...alternate.snapshot().schemas);
    const after = structuredClone(before);
    after.entities[0].schema = 'AlternateUser';

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        kind: 'entity-schema-changed',
        classification: 'breaking',
      }),
    ]);
  });

  it('classifies secondary physical index add, change, and remove', () => {
    const added = clone() as any;
    added.secondaryIndexes.push({
      name: 'GSI2',
      kind: 'gsi',
      pk: 'x',
      sk: 'y',
    });
    expect(Snapshot.diff(table(), added)[0]).toMatchObject({
      kind: 'secondary-index-added',
      classification: 'requires-backfill',
    });

    const changed = clone() as any;
    changed.secondaryIndexes[0].sk = 'next';
    expect(Snapshot.diff(table(), changed)[0]).toMatchObject({
      classification: 'requires-backfill',
    });

    const removed = clone() as any;
    removed.secondaryIndexes = [];
    removed.entities[0].secondaryDerivations = [];
    expect(
      Snapshot.diff(table(), removed).find(
        ({ kind }) => kind === 'secondary-index-removed',
      ),
    ).toMatchObject({ classification: 'safe' });
  });

  it('classifies entity add/remove and treats rename as remove plus add', () => {
    const added = clone() as any;
    added.entities.push({
      ...added.entities[0],
      name: 'Admin',
      secondaryDerivations: [],
    });
    expect(
      Snapshot.diff(table(), added).find(({ kind }) => kind === 'entity-added'),
    ).toMatchObject({ classification: 'safe' });

    const removed = clone() as any;
    removed.entities = [];
    expect(
      Snapshot.diff(table(), removed).find(
        ({ kind }) => kind === 'entity-removed',
      ),
    ).toMatchObject({ classification: 'breaking' });

    const renamed = clone() as any;
    renamed.entities[0].name = 'Account';
    expect(
      Snapshot.diff(table(), renamed)
        .filter(({ scope }) => scope === 'entity')
        .map(({ classification }) => classification)
        .sort(),
    ).toEqual(['breaking', 'safe']);
  });

  it('classifies secondary entity derivation add/change/move/remove/rename', () => {
    const added = clone() as any;
    added.entities[0].secondaryDerivations.push({
      name: 'timeline',
      physicalIndex: 'GSI1',
      pk: ['id'],
      sk: ['_u'],
    });
    expect(
      Snapshot.diff(table(), added).find(
        ({ kind }) => kind === 'entity-index-added',
      ),
    ).toMatchObject({ classification: 'requires-backfill' });

    for (const mutate of [
      (value: any) => (value.entities[0].secondaryDerivations[0].pk = ['id']),
      (value: any) =>
        (value.entities[0].secondaryDerivations[0].physicalIndex = 'GSI2'),
    ]) {
      const current = clone() as any;
      if (String(mutate).includes('GSI2'))
        current.secondaryIndexes.push({
          name: 'GSI2',
          kind: 'gsi',
          pk: 'x',
          sk: 'y',
        });
      mutate(current);
      expect(
        Snapshot.diff(table(), current).find(({ kind }) =>
          kind.startsWith('entity-index-'),
        ),
      ).toMatchObject({ classification: 'requires-backfill' });
    }

    const removed = clone() as any;
    removed.entities[0].secondaryDerivations = [];
    expect(
      Snapshot.diff(table(), removed).find(
        ({ kind }) => kind === 'entity-index-removed',
      ),
    ).toMatchObject({ classification: 'safe' });

    const renamed = clone() as any;
    renamed.entities[0].secondaryDerivations[0].name = 'byAddress';
    expect(
      Snapshot.diff(table(), renamed)
        .filter(({ kind }) => kind.startsWith('entity-index-'))
        .map(({ classification }) => classification)
        .sort(),
    ).toEqual(['requires-backfill', 'safe']);
  });

  it('delegates ESchema append, edit, delete, and nested transitive changes', () => {
    const evolved = EntityESchema.make('User', 'id', { email: Schema.String })
      .evolve('v2', { active: Schema.Boolean }, (value) => ({
        ...value,
        active: true,
      }))
      .build();
    const appended = clone() as any;
    appended.schemas = evolved.snapshot().schemas;
    expect(
      Snapshot.diff(table(), appended).find(
        ({ kind }) => kind === 'version-added',
      ),
    ).toMatchObject({ classification: 'safe' });

    const edited = clone() as any;
    edited.schemas[0].versions[0].encoded = { edited: true };
    expect(Snapshot.diff(table(), edited)[0]).toMatchObject({
      kind: 'encoded-changed',
      classification: 'breaking',
    });

    const deleted = structuredClone(appended);
    deleted.schemas[0].versions = deleted.schemas[0].versions.slice(0, 1);
    expect(
      Snapshot.diff(appended, deleted).find(
        ({ kind }) => kind === 'version-deleted',
      ),
    ).toMatchObject({ classification: 'breaking' });

    const childV1 = EntityESchema.make('Child', 'id', {
      value: Schema.String,
    }).build();
    const childV2 = EntityESchema.make('Child', 'id', { value: Schema.String })
      .evolve('v2', { count: Schema.Number }, (value) => ({
        ...value,
        count: 0,
      }))
      .build();
    const parent = (child: typeof childV1 | typeof childV2) =>
      EntityESchema.make('Parent', 'id', {
        child: toSchema(child),
      }).build();
    const nestedBefore = {
      ...table(),
      entities: [{ ...table().entities[0]!, name: 'Parent', schema: 'Parent' }],
      schemas: parent(childV1).snapshot().schemas,
    };
    const nestedAfter = {
      ...nestedBefore,
      schemas: parent(childV2).snapshot().schemas,
    };
    expect(
      Snapshot.diff(nestedBefore, nestedAfter).find(
        ({ kind }) => kind === 'transitive-version-added',
      ),
    ).toMatchObject({ classification: 'safe' });
  });

  it('stops at adapter mismatch and rejects invalid references', async () => {
    const other = clone() as any;
    other.adapter = 'sqlite';
    other.primaryIndex.pk = 'different';
    expect(Snapshot.diff(table(), other)).toEqual([
      expect.objectContaining({
        kind: 'adapter-changed',
        classification: 'unverifiable',
      }),
    ]);

    const danglingSchema = clone() as any;
    danglingSchema.entities[0].schema = 'Missing';
    await expect(
      Effect.runPromise(Snapshot.decode(danglingSchema)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);
    expect(() => Snapshot.diff(table(), danglingSchema)).toThrow(
      SnapshotDecodeError,
    );

    const danglingIndex = clone() as any;
    danglingIndex.entities[0].secondaryDerivations[0].physicalIndex = 'Missing';
    await expect(
      Effect.runPromise(Snapshot.decode(danglingIndex)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);
  });

  it('rejects malformed nested table fields', async () => {
    for (const malformed of [
      {
        ...clone(),
        secondaryIndexes: [{ name: 'GSI1', kind: 'bogus', pk: 1, sk: null }],
      },
      {
        ...clone(),
        entities: [{ ...clone().entities[0], kind: 'bogus' }],
      },
      {
        ...clone(),
        entities: [
          {
            ...clone().entities[0],
            primaryDerivation: { pk: ['email'], sk: [1] },
          },
        ],
      },
    ]) {
      await expect(
        Effect.runPromise(Snapshot.decode(malformed)),
      ).rejects.toBeInstanceOf(SnapshotDecodeError);
    }
  });
});
