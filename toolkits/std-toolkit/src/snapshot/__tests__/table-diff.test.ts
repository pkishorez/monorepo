import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema, toSchema } from '../../eschema/index.js';
import { Snapshot, SnapshotDecodeError, type TableSnapshot } from '../index.js';

const schema = EntityESchema.make('User', 'id', {
  email: Schema.String,
}).build();

function table(): TableSnapshot {
  return {
    _v: 'v2',
    kind: 'table',
    logicalName: 'app',
    topology: {
      primary: { pk: 'pk', sk: 'sk' },
      localSecondaryIndexes: [],
      globalSecondaryIndexes: [{ name: 'GSI1', pk: 'gpk', sk: 'gsk' }],
    },
    entities: [
      {
        name: 'User',
        kind: 'keyed',
        schema: 'User',
        idField: 'id',
        primary: { pk: ['email'], sk: ['id'] },
        accessPatterns: [
          {
            name: 'byEmail',
            kind: 'gsi',
            index: 'GSI1',
            pk: ['email'],
            sk: ['_u'],
          },
          { name: 'primary', kind: 'primary', pk: ['email'], sk: ['id'] },
        ],
      },
    ],
    schemas: Snapshot.capture(schema).schemas,
  };
}

function clone(): TableSnapshot {
  return structuredClone(table());
}

describe('table snapshot diff', () => {
  it('returns no changes for identical tables and sorts changes deterministically', () => {
    expect(Snapshot.diff(table(), clone())).toEqual([]);
    const current = clone() as any;
    current.topology.primary.pk = 'nextPk';
    current.entities[0].idField = 'nextId';
    const changes = Snapshot.diff(table(), current);
    expect(changes.map(({ subject }) => subject.kind)).toEqual(
      changes.map(({ subject }) => subject.kind).toSorted(),
    );
    expect(changes.every(({ impact }) => impact === 'breaking')).toBe(true);
  });

  it('classifies primary topology and retained entity identity changes as breaking', () => {
    for (const mutate of [
      (value: any) => (value.topology.primary.sk = 'nextSk'),
      (value: any) => (value.entities[0].idField = 'userId'),
      (value: any) => (value.entities[0].kind = 'single'),
      (value: any) => (value.entities[0].primary.pk = ['id']),
    ]) {
      const current = clone() as any;
      mutate(current);
      expect(Snapshot.diff(table(), current)).toEqual([
        expect.objectContaining({ impact: 'breaking' }),
      ]);
    }
  });

  it('classifies an entity schema reference change as breaking', () => {
    const alternate = EntityESchema.make('AlternateUser', 'id', {
      email: Schema.String,
    }).build();
    const before = clone() as any;
    before.schemas.push(...Snapshot.capture(alternate).schemas);
    const after = structuredClone(before);
    after.entities[0].schema = 'AlternateUser';

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        subject: expect.objectContaining({ kind: 'entity' }),
        action: 'edited',
        impact: 'breaking',
      }),
    ]);
  });

  it('classifies secondary physical index add, change, and remove', () => {
    const added = clone() as any;
    added.topology.globalSecondaryIndexes.push({
      name: 'GSI2',
      pk: 'x',
      sk: 'y',
    });
    expect(Snapshot.diff(table(), added)[0]).toMatchObject({
      subject: { kind: 'global-secondary-index', name: 'GSI2' },
      action: 'added',
      impact: 'requires-backfill',
    });

    const changed = clone() as any;
    changed.topology.globalSecondaryIndexes[0].sk = 'next';
    expect(Snapshot.diff(table(), changed)[0]).toMatchObject({
      impact: 'requires-backfill',
    });

    const removed = clone() as any;
    removed.topology.globalSecondaryIndexes = [];
    removed.entities[0].accessPatterns =
      removed.entities[0].accessPatterns.filter(
        ({ kind }: { kind: string }) => kind === 'primary',
      );
    expect(
      Snapshot.diff(table(), removed).find(
        ({ subject }) => subject.kind === 'global-secondary-index',
      ),
    ).toMatchObject({ action: 'removed', impact: 'safe' });
  });

  it('classifies local secondary index add and remove', () => {
    const added = clone() as any;
    added.topology.localSecondaryIndexes.push({
      name: 'LSI1',
      pk: 'pk',
      sk: 'lsk',
    });
    expect(Snapshot.diff(table(), added)[0]).toMatchObject({
      subject: { kind: 'local-secondary-index', name: 'LSI1' },
      action: 'added',
      impact: 'requires-backfill',
    });
    expect(Snapshot.diff(added, table())[0]).toMatchObject({
      subject: { kind: 'local-secondary-index', name: 'LSI1' },
      action: 'removed',
      impact: 'safe',
    });
  });

  it('classifies entity add/remove and treats rename as remove plus add', () => {
    const added = clone() as any;
    added.entities.push({
      ...added.entities[0],
      name: 'Admin',
      accessPatterns: [],
    });
    expect(
      Snapshot.diff(table(), added).find(
        ({ subject, action }) =>
          subject.kind === 'entity' && action === 'added',
      ),
    ).toMatchObject({ impact: 'safe' });

    const removed = clone() as any;
    removed.entities = [];
    expect(
      Snapshot.diff(table(), removed).find(
        ({ subject, action }) =>
          subject.kind === 'entity' && action === 'removed',
      ),
    ).toMatchObject({ impact: 'breaking' });

    const renamed = clone() as any;
    renamed.entities[0].name = 'Account';
    expect(
      Snapshot.diff(table(), renamed)
        .filter(({ subject }) => subject.kind === 'entity')
        .map(({ impact }) => impact)
        .sort(),
    ).toEqual(['breaking', 'safe']);
  });

  it('classifies access pattern add/change/move/remove/rename', () => {
    const added = clone() as any;
    added.entities[0].accessPatterns.push({
      name: 'timeline',
      kind: 'gsi',
      index: 'GSI1',
      pk: ['id'],
      sk: ['_u'],
    });
    expect(
      Snapshot.diff(table(), added).find(
        ({ subject, action }) =>
          subject.kind === 'access-pattern' && action === 'added',
      ),
    ).toMatchObject({ impact: 'requires-backfill' });

    for (const mutate of [
      (value: any) => (value.entities[0].accessPatterns[0].pk = ['id']),
      (value: any) => (value.entities[0].accessPatterns[0].index = 'GSI2'),
    ]) {
      const current = clone() as any;
      if (String(mutate).includes('GSI2'))
        current.topology.globalSecondaryIndexes.push({
          name: 'GSI2',
          pk: 'x',
          sk: 'y',
        });
      mutate(current);
      expect(
        Snapshot.diff(table(), current).find(
          ({ subject }) => subject.kind === 'access-pattern',
        ),
      ).toMatchObject({ impact: 'requires-backfill' });
    }

    const removed = clone() as any;
    removed.entities[0].accessPatterns =
      removed.entities[0].accessPatterns.filter(
        ({ kind }: { kind: string }) => kind === 'primary',
      );
    expect(
      Snapshot.diff(table(), removed).find(
        ({ subject, action }) =>
          subject.kind === 'access-pattern' && action === 'removed',
      ),
    ).toMatchObject({ impact: 'safe' });

    const renamed = clone() as any;
    renamed.entities[0].accessPatterns[0].name = 'byAddress';
    expect(
      Snapshot.diff(table(), renamed)
        .filter(({ subject }) => subject.kind === 'access-pattern')
        .map(({ impact }) => impact)
        .sort(),
    ).toEqual(['requires-backfill', 'safe']);
  });

  it('classifies a primary access pattern change as breaking', () => {
    const current = clone() as any;
    current.entities[0].primary.sk = ['email'];
    current.entities[0].accessPatterns[1].sk = ['email'];
    expect(Snapshot.diff(table(), current).map(({ impact }) => impact)).toEqual(
      ['breaking', 'breaking'],
    );
  });

  it('delegates ESchema append, edit, delete, and nested changes', () => {
    const evolved = EntityESchema.make('User', 'id', { email: Schema.String })
      .evolve('v2', { active: Schema.Boolean }, (value) => ({
        ...value,
        active: true,
      }))
      .build();
    const appended = clone() as any;
    appended.schemas = Snapshot.capture(evolved).schemas;
    expect(
      Snapshot.diff(table(), appended).find(
        ({ subject, action }) =>
          subject.kind === 'version' && action === 'added',
      ),
    ).toMatchObject({ impact: 'safe' });

    const edited = clone() as any;
    edited.schemas[0].versions[0].encoded = { edited: true };
    expect(Snapshot.diff(table(), edited)[0]).toMatchObject({
      subject: expect.objectContaining({ kind: 'version' }),
      action: 'edited',
      impact: 'breaking',
    });

    const deleted = structuredClone(appended);
    deleted.schemas[0].versions = deleted.schemas[0].versions.slice(0, 1);
    expect(
      Snapshot.diff(appended, deleted).find(
        ({ subject, action }) =>
          subject.kind === 'version' && action === 'removed',
      ),
    ).toMatchObject({ impact: 'breaking' });

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
      schemas: Snapshot.capture(parent(childV1)).schemas,
    };
    const nestedAfter = {
      ...nestedBefore,
      schemas: Snapshot.capture(parent(childV2)).schemas,
    };
    expect(Snapshot.diff(nestedBefore, nestedAfter)).toEqual([
      expect.objectContaining({
        subject: expect.objectContaining({
          kind: 'version',
          name: 'Child',
          version: 'v2',
        }),
        action: 'added',
        impact: 'safe',
      }),
    ]);
  });

  it('reports a rename alongside the remaining changes', () => {
    const other = clone() as any;
    other.logicalName = 'legacy';
    other.topology.primary.pk = 'different';
    expect(Snapshot.diff(table(), other)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: expect.objectContaining({ kind: 'table' }),
          impact: 'breaking',
        }),
        expect.objectContaining({
          subject: expect.objectContaining({ kind: 'primary-index' }),
          impact: 'breaking',
        }),
      ]),
    );
  });

  it('rejects invalid references with a described cause', async () => {
    const danglingSchema = clone() as any;
    danglingSchema.entities[0].schema = 'Missing';
    await expect(
      Effect.runPromise(Snapshot.decode(danglingSchema)),
    ).rejects.toThrow(/Dangling entity schema ref: Missing/);
    expect(() => Snapshot.diff(table(), danglingSchema)).toThrow(
      SnapshotDecodeError,
    );

    const danglingIndex = clone() as any;
    danglingIndex.entities[0].accessPatterns[0].index = 'Missing';
    await expect(
      Effect.runPromise(Snapshot.decode(danglingIndex)),
    ).rejects.toBeInstanceOf(SnapshotDecodeError);

    const crossKindIndex = clone() as any;
    crossKindIndex.topology.localSecondaryIndexes = [
      { name: 'LSI1', pk: 'pk', sk: 'lsk' },
    ];
    crossKindIndex.entities[0].accessPatterns[0].kind = 'lsi';
    crossKindIndex.entities[0].accessPatterns[0].index = 'GSI1';
    await expect(
      Effect.runPromise(Snapshot.decode(crossKindIndex)),
    ).rejects.toThrow(/Dangling lsi index ref: GSI1/);

    const legacy = { ...clone(), _v: 'v1' };
    await expect(Effect.runPromise(Snapshot.decode(legacy))).rejects.toThrow(
      /retired "v1" format/,
    );
  });

  it('rejects malformed nested table fields', async () => {
    for (const malformed of [
      {
        ...clone(),
        topology: {
          ...clone().topology,
          globalSecondaryIndexes: [{ name: 'GSI1', pk: 1, sk: null }],
        },
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
            primary: { pk: ['email'], sk: [1] },
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
