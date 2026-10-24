import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../db/index.js';
import { SetupRefused } from '../../db/stored-contract/index.js';
import { type AnyEntityESchema, EntityESchema } from '../../eschema/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import { checkDeploy } from '../deploy-guard/deploy-guard.js';

const stored = (schema: AnyEntityESchema) => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  table.entity(schema).primary().build();
  return Effect.runSync(TableSnapshot.serialize(TableSnapshot.capture(table)));
};

const Task = EntityESchema.make('Task', 'id', { title: Schema.String }).build();

const capture = (
  table: ReturnType<ReturnType<typeof StdTable.make>['primary']>,
) => {
  const built = table.build();
  built.entity(Task).primary().build();
  return Effect.runSync(TableSnapshot.serialize(TableSnapshot.capture(built)));
};

const tasksTable = () => StdTable.make('tasks').primary('pk', 'sk');
const plain = capture(tasksTable());
const withLocalIndex = capture(tasksTable().lsi('LSI1', 'LSI1SK'));
const withGlobalIndex = capture(tasksTable().gsi('GSI1', 'GSI1PK', 'GSI1SK'));

const v1 = stored(
  EntityESchema.make('Task', 'id', { title: Schema.String }).build(),
);
const appended = stored(
  EntityESchema.make('Task', 'id', { title: Schema.String })
    .evolve('v2', { title: Schema.String, done: Schema.Boolean }, (task) => ({
      ...task,
      done: false,
    }))
    .build(),
);
const edited = stored(
  EntityESchema.make('Task', 'id', { title: Schema.Finite }).build(),
);

const deploy = (
  previous: Parameters<typeof checkDeploy>[0],
  current: Parameters<typeof checkDeploy>[1],
) => Effect.runSync(Effect.exit(checkDeploy(previous, current)));

const deployed = (current: Parameters<typeof checkDeploy>[1]) => {
  const exit = deploy(undefined, current);
  if (!Exit.isSuccess(exit)) throw new Error('first deploy failed');
  return exit.value;
};

const refusal = (exit: ReturnType<typeof deploy>) =>
  Exit.isFailure(exit)
    ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error
    : undefined;

describe('deploy guard', () => {
  it('records the first contract at generation 0', () => {
    expect(deployed({ mode: 'persistent', snapshot: v1 }).snapshot).toBe(v1);
  });

  it('accepts an appended version', () => {
    const exit = deploy(deployed({ mode: 'persistent', snapshot: v1 }), {
      mode: 'persistent',
      snapshot: appended,
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it('refuses a persistent table an edited version and names the change', () => {
    const error = refusal(
      deploy(deployed({ mode: 'persistent', snapshot: v1 }), {
        mode: 'persistent',
        snapshot: edited,
      }),
    );
    expect(error).toBeInstanceOf(SetupRefused);
    expect((error as SetupRefused).reason).toBe('breaking');
    expect((error as SetupRefused).changes.length).toBeGreaterThan(0);
  });

  it('refuses a persistent table becoming disposable', () => {
    const error = refusal(
      deploy(deployed({ mode: 'persistent', snapshot: v1 }), {
        mode: 'disposable',
        snapshot: v1,
      }),
    );
    expect((error as SetupRefused).reason).toBe('mode-change');
  });

  it('lets a disposable table with its own setup take an edited version', () => {
    const exit = deploy(deployed({ mode: 'disposable', snapshot: v1 }), {
      mode: 'disposable',
      snapshot: edited,
    });
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it('lets a disposable table become persistent', () => {
    const exit = deploy(deployed({ mode: 'disposable', snapshot: v1 }), {
      mode: 'persistent',
      snapshot: v1,
    });
    expect(Exit.isSuccess(exit) && exit.value.mode).toBe('persistent');
  });

  it('starts a fresh contract for a new physical table', () => {
    const exit = deploy(
      deployed({ mode: 'persistent', snapshot: v1, target: 'db-1/tasks' }),
      { mode: 'persistent', snapshot: edited, target: 'db-2/tasks' },
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});

describe('deploy guard for a table changed in place only (DynamoDB)', () => {
  const inPlace = (
    mode: 'persistent' | 'disposable',
    from: unknown,
    to: unknown,
  ) =>
    deploy(deployed({ mode, snapshot: from, inPlaceOnly: true }), {
      mode,
      snapshot: to,
      inPlaceOnly: true,
    });

  for (const mode of ['persistent', 'disposable'] as const) {
    it(`lets a ${mode} table add a global secondary index`, () => {
      expect(Exit.isSuccess(inPlace(mode, plain, withGlobalIndex))).toBe(true);
    });

    it(`refuses a ${mode} table a new local secondary index`, () => {
      expect(
        (refusal(inPlace(mode, plain, withLocalIndex)) as SetupRefused).reason,
      ).toBe('replaces-table');
    });

    it(`refuses a ${mode} table removing a global secondary index`, () => {
      expect(
        (refusal(inPlace(mode, withGlobalIndex, plain)) as SetupRefused).reason,
      ).toBe('replaces-table');
    });
  }

  it('refuses a new order of local secondary indexes, which DynamoDB replaces on', () => {
    const exit = deploy(
      deployed({
        mode: 'persistent',
        snapshot: withLocalIndex,
        inPlaceOnly: true,
        localIndexOrder: ['A', 'B'],
      }),
      {
        mode: 'persistent',
        snapshot: withLocalIndex,
        inPlaceOnly: true,
        localIndexOrder: ['B', 'A'],
      },
    );
    expect((refusal(exit) as SetupRefused).reason).toBe('replaces-table');
  });

  it('still checks a table against its own contract after a move that never finished', () => {
    const atA = deployed({ mode: 'persistent', snapshot: v1, target: 'A' });
    // A deploy to B is accepted, then stops before the table moves.
    const toB = deploy(atA, {
      mode: 'persistent',
      snapshot: edited,
      target: 'B',
    });
    if (!Exit.isSuccess(toB)) throw new Error('the move to B failed');
    const backToA = deploy(toB.value, {
      mode: 'persistent',
      snapshot: edited,
      target: 'A',
    });
    expect((refusal(backToA) as SetupRefused).reason).toBe('breaking');
  });

  it('refuses a new physical name, which DynamoDB makes by deleting the old table', () => {
    const exit = deploy(
      deployed({
        mode: 'persistent',
        snapshot: v1,
        target: 'tasks-a',
        inPlaceOnly: true,
      }),
      {
        mode: 'persistent',
        snapshot: v1,
        target: 'tasks-b',
        inPlaceOnly: true,
      },
    );
    expect((refusal(exit) as SetupRefused).reason).toBe('renames-table');
  });

  it('refuses a disposable table a breaking change instead of wiping it', () => {
    const error = refusal(inPlace('disposable', v1, edited)) as SetupRefused;
    expect(error.reason).toBe('replaces-table');
    expect(error.message).toMatch(/new DynamoDB.table resource/);
  });
});
