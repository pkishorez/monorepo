import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { ESchema, toSchema } from '../../eschema/index.js';
import { Snapshot } from '../index.js';

describe('Snapshot.diff', () => {
  it('reports a nested next version once as safe', () => {
    const childV1 = ESchema.make('Child', { value: Schema.String }).build();
    const before = Snapshot.capture(
      ESchema.make('Parent', { child: toSchema(childV1) }).build(),
    );
    const childV2 = ESchema.make('Child', { value: Schema.String })
      .evolve('v2', { count: Schema.Number }, (value) => ({
        ...value,
        count: 0,
      }))
      .build();
    const after = Snapshot.capture(
      ESchema.make('Parent', { child: toSchema(childV2) }).build(),
    );

    expect(Snapshot.diff(before, after)).toEqual([
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
      Snapshot.diff(before, after).every((item) => item.impact === 'safe'),
    ).toBe(true);
  });

  it('reports encoded and decoded approved edits independently', () => {
    const previous = Snapshot.capture(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const encodedEdit = JSON.parse(JSON.stringify(previous));
    encodedEdit.schemas[0]!.versions[0]!.encoded = { changed: true };
    const decodedEdit = JSON.parse(JSON.stringify(previous));
    decodedEdit.schemas[0]!.versions[0]!.decoded = { changed: true };

    expect(Snapshot.diff(previous, encodedEdit)[0]).toMatchObject({
      action: 'edited',
      impact: 'breaking',
      edits: [expect.objectContaining({ side: 'encoded' })],
    });
    expect(Snapshot.diff(previous, decodedEdit)[0]).toMatchObject({
      action: 'edited',
      impact: 'breaking',
      edits: [expect.objectContaining({ side: 'decoded' })],
    });
  });

  it('reports exact nested edits and combines matching encoded and decoded sides', () => {
    const before = Snapshot.capture(
      ESchema.make('Item', {
        profile: Schema.Struct({ displayName: Schema.String }),
      }).build(),
    );
    const after = Snapshot.capture(
      ESchema.make('Item', {
        profile: Schema.Struct({
          displayName: Schema.NullOr(Schema.String),
        }),
      }).build(),
    );

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        action: 'edited',
        impact: 'breaking',
        edits: [
          expect.objectContaining({
            path: ['profile', 'displayName'],
            side: 'encoded-and-decoded',
          }),
        ],
      }),
    ]);
  });

  it.each([
    ['parameter', { _tag: 'StringKeyword' }, { _tag: 'SymbolKeyword' }],
    ['type', { _tag: 'StringKeyword' }, { _tag: 'NumberKeyword' }],
  ] as const)(
    'reports object index signature %s edits alongside named properties',
    (part, previous, current) => {
      const before = Snapshot.capture(
        ESchema.make('Item', { id: Schema.String }).build(),
      );
      const after = structuredClone(before);
      for (const snapshot of [before, after]) {
        const version = snapshot.schemas[0]!.versions[0]!;
        for (const schema of [version.encoded, version.decoded]) {
          const { representation } = schema as unknown as {
            representation: { indexSignatures: unknown[] };
          };
          representation.indexSignatures = [
            {
              parameter: { _tag: 'StringKeyword' },
              type: { _tag: 'StringKeyword' },
            },
          ];
        }
      }
      const version = after.schemas[0]!.versions[0]!;
      for (const schema of [version.encoded, version.decoded]) {
        const { representation } = schema as unknown as {
          representation: {
            indexSignatures: Record<string, unknown>[];
          };
        };
        representation.indexSignatures[0]![part] = current;
      }

      expect(Snapshot.diff(before, after)).toEqual([
        expect.objectContaining({
          action: 'edited',
          impact: 'breaking',
          edits: [
            expect.objectContaining({
              path: ['indexSignatures', '0', part],
              before: previous,
              after: current,
              side: 'encoded-and-decoded',
            }),
          ],
        }),
      ]);
    },
  );

  it('reports root changes as breaking', () => {
    const first = Snapshot.capture(
      ESchema.make('First', { value: Schema.String }).build(),
    );
    const second = Snapshot.capture(
      ESchema.make('Second', { value: Schema.String }).build(),
    );
    const before = {
      ...first,
      schemas: [...first.schemas, ...second.schemas],
    };
    const after = { ...before, root: 'Second' };

    expect(Snapshot.diff(before, after)).toEqual([
      expect.objectContaining({
        subject: expect.objectContaining({ kind: 'snapshot' }),
        action: 'edited',
        impact: 'breaking',
      }),
    ]);
  });

  it('classifies multiple appended versions as safe', () => {
    const before = Snapshot.capture(
      ESchema.make('Item', { value: Schema.String }).build(),
    );
    const after = Snapshot.capture(
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

    expect(Snapshot.diff(before, after)).toEqual([
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
      Snapshot.diff(Snapshot.capture(v2), Snapshot.capture(changedMigration)),
    ).toEqual([]);

    const cosmetic = ESchema.make('Item', {
      value: Schema.String.annotate({ title: 'Cosmetic' }),
    }).build();
    expect(
      Snapshot.diff(
        Snapshot.capture(
          ESchema.make('Item', { value: Schema.String }).build(),
        ),
        Snapshot.capture(cosmetic),
      ),
    ).toEqual([]);

    const deleted = JSON.parse(JSON.stringify(Snapshot.capture(v2)));
    deleted.schemas[0]!.versions = deleted.schemas[0]!.versions.slice(0, 1);
    expect(Snapshot.diff(Snapshot.capture(v2), deleted)[0]).toMatchObject({
      action: 'removed',
      impact: 'breaking',
      subject: expect.objectContaining({ kind: 'version', version: 'v2' }),
    });
  });
});
