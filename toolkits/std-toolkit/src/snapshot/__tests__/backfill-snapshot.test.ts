import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../db/index.js';
import { EntityESchema } from '../../eschema/index.js';
import { TableSnapshot } from '../index.js';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
});
const Task = TaskV1.evolve('v2', { projectId: Schema.String }).build();

const board = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .entity(Task, (e) =>
    e.primary().index('GSI1', 'byProject', { pk: ['projectId'] }),
  )
  .backfill('task-project', {
    entity: 'Task',
    to: 'v2',
    run: (task) => Effect.succeed({ ...task, projectId: 'p1' }),
  })
  .backfill('task-by-project', { reindex: 'Task', after: ['task-project'] })
  .build();

const before = () =>
  TableSnapshot.capture(
    StdTable.make('board')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .entity(TaskV1.build(), (e) => e.primary())
      .build(),
  );
const current = () => TableSnapshot.capture(board);

describe('gap versions and Backfills in a table snapshot', () => {
  it('records each version gap flag and the Backfills, without run', () => {
    const snapshot = current();
    expect(snapshot.schemas[0]?.versions.map(({ gap }) => gap)).toEqual([
      false,
      true,
    ]);
    expect(snapshot.backfills).toEqual([
      {
        id: 'task-by-project',
        kind: 'reindex',
        entity: 'Task',
        to: null,
        after: ['task-project'],
      },
      {
        id: 'task-project',
        kind: 'gap',
        entity: 'Task',
        to: 'v2',
        after: [],
      },
    ]);
  });

  it('reads a document from before gaps as having none, and writes the new format', async () => {
    const snapshot = before();
    const encoded = (await Effect.runPromise(
      TableSnapshot.serialize(snapshot),
    )) as Record<string, unknown>;
    expect(encoded._v).toBe('v2');
    const { backfills: _, ...v1 } = encoded;
    const fromV1 = {
      ...v1,
      _v: 'v1',
      schemas: snapshot.schemas.map((definition) => ({
        ...definition,
        versions: definition.versions.map(({ gap: _gap, ...version }) => ({
          ...version,
        })),
      })),
    };
    expect(await Effect.runPromise(TableSnapshot.parse(fromV1))).toEqual(
      snapshot,
    );
  });

  it('round-trips a document with Backfills', async () => {
    const snapshot = current();
    const encoded = await Effect.runPromise(TableSnapshot.serialize(snapshot));
    expect(await Effect.runPromise(TableSnapshot.parse(encoded))).toEqual(
      snapshot,
    );
  });

  it('classifies an added gap version as needing a Backfill, naming it', () => {
    const changes = TableSnapshot.diff(before(), current());
    const gap = changes.find(({ subject }) => subject.kind === 'version');
    expect(gap).toEqual({
      subject: { kind: 'version', name: 'Task', version: 'v2' },
      action: 'added',
      impact: 'requires-backfill',
      edits: [],
      description:
        'Task v2 is a gap version: rows stored before it read only after a Backfill fills it',
    });
    // Adding a Backfill is safe; the index change keeps its own impact.
    expect(
      changes
        .filter(({ subject }) => subject.kind === 'backfill')
        .map(({ subject, action, impact }) => [subject.name, action, impact]),
    ).toEqual([
      ['task-by-project', 'added', 'safe'],
      ['task-project', 'added', 'safe'],
    ]);
    expect(
      changes.find(({ subject }) => subject.kind === 'access-pattern')?.impact,
    ).toBe('requires-backfill');
  });

  it('classifies a migrated version added after as safe', () => {
    const next = structuredClone(current()) as any;
    next.schemas[0].versions.push({
      ...next.schemas[0].versions[1],
      version: 'v3',
      gap: false,
    });
    expect(TableSnapshot.diff(current(), next)).toMatchObject([
      {
        subject: { kind: 'version', version: 'v3' },
        action: 'added',
        impact: 'safe',
      },
    ]);
  });

  it('classifies turning a shipped version into a gap, or back, as breaking', () => {
    const next = structuredClone(current()) as any;
    next.schemas[0].versions[1].gap = false;
    next.backfills = next.backfills.filter(
      ({ kind }: { kind: string }) => kind === 'reindex',
    );
    next.backfills[0].after = [];
    expect(
      TableSnapshot.diff(current(), next).filter(
        ({ subject }) => subject.kind === 'version',
      ),
    ).toEqual([
      {
        subject: { kind: 'version', name: 'Task', version: 'v2' },
        action: 'edited',
        impact: 'breaking',
        edits: [{ path: ['gap'], before: true, after: false }],
      },
    ]);
  });

  it('classifies a removed Backfill, or a change to what it fills, as breaking', () => {
    const removed = structuredClone(current()) as any;
    removed.backfills = removed.backfills.filter(
      ({ id }: { id: string }) => id === 'task-project',
    );
    expect(TableSnapshot.diff(current(), removed)).toMatchObject([
      {
        subject: { kind: 'backfill', name: 'task-by-project' },
        action: 'removed',
        impact: 'breaking',
      },
    ]);

    const retargeted = structuredClone(current()) as any;
    retargeted.backfills[0].kind = 'gap';
    retargeted.backfills[0].to = 'v2';
    retargeted.backfills[1].kind = 'reindex';
    retargeted.backfills[1].to = null;
    expect(
      TableSnapshot.diff(current(), retargeted).map(
        ({ subject, impact, edits }) => [
          subject.name,
          impact,
          edits.map(({ path }) => path.join('.')),
        ],
      ),
    ).toEqual([
      ['task-by-project', 'breaking', ['kind', 'to']],
      ['task-project', 'breaking', ['kind', 'to']],
    ]);
  });

  it('classifies a change of after as safe', () => {
    const next = structuredClone(current()) as any;
    next.backfills[0].after = [];
    expect(TableSnapshot.diff(current(), next)).toMatchObject([
      {
        subject: { kind: 'backfill', name: 'task-by-project' },
        action: 'edited',
        impact: 'safe',
        edits: [{ path: ['after'], before: ['task-project'], after: [] }],
      },
    ]);
  });

  it('renders gap versions and Backfills for review', () => {
    const removed = structuredClone(current()) as any;
    removed.backfills = [];
    const rendered = TableSnapshot.renderChanges([
      ...TableSnapshot.diff(before(), current()),
      ...TableSnapshot.diff(current(), removed),
    ]);
    expect(rendered).toContain(
      [
        'BREAKING',
        '  Backfill task-by-project removed',
        '    A shipped Backfill is never removed: a table it has not finished on could not read the rows it was filling',
      ].join('\n'),
    );
    expect(rendered).toContain(
      [
        '  Task v2 added',
        '    Task v2 is a gap version: rows stored before it read only after a Backfill fills it',
      ].join('\n'),
    );
    expect(rendered).toContain('SAFE\n  Backfill task-by-project added');
  });

  it.each([
    [
      'a duplicate id',
      (s: any) => s.backfills.push({ ...s.backfills[0] }),
      'Duplicate Backfill: task-by-project',
    ],
    [
      'an unknown after',
      (s: any) => (s.backfills[0].after = ['nope']),
      'Dangling Backfill ref: task-by-project after nope',
    ],
    [
      'an unknown entity',
      (s: any) => (s.backfills[0].entity = 'Ghost'),
      'Dangling Backfill entity ref: Ghost',
    ],
    [
      'a version that is not a gap',
      (s: any) => (s.backfills[1].to = 'v1'),
      'Backfill task-project fills Task v1, which is not a gap version',
    ],
    [
      'a reindex naming a version',
      (s: any) => (s.backfills[0].to = 'v2'),
      'Reindex Backfill task-by-project must not name a version',
    ],
  ])('refuses a document with %s', async (_, corrupt, issue) => {
    const encoded = structuredClone(
      await Effect.runPromise(TableSnapshot.serialize(current())),
    );
    corrupt(encoded);
    await expect(
      Effect.runPromise(TableSnapshot.parse(encoded)),
    ).rejects.toThrow(issue);
  });
});
