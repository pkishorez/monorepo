import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../db/index.js';
import { SetupRefused } from '../../db/stored-contract/index.js';
import { type AnyEntityESchema, EntityESchema } from '../../eschema/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import { checkDeploy, diffContract } from '../deploy-guard/deploy-guard.js';

const stored = (schema: AnyEntityESchema) => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  table.entity(schema).primary().build();
  return Effect.runSync(TableSnapshot.serialize(TableSnapshot.capture(table)));
};

const withLocalIndex = (() => {
  const table = StdTable.make('tasks')
    .primary('pk', 'sk')
    .lsi('LSI1', 'LSI1SK')
    .build();
  table
    .entity(EntityESchema.make('Task', 'id', { title: Schema.String }).build())
    .primary()
    .build();
  return Effect.runSync(TableSnapshot.serialize(TableSnapshot.capture(table)));
})();

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
    expect(deployed({ mode: 'persistent', snapshot: v1 }).generation).toBe(0);
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

  it('moves a disposable table to its next generation on an edited version', () => {
    const exit = deploy(deployed({ mode: 'disposable', snapshot: v1 }), {
      mode: 'disposable',
      snapshot: edited,
    });
    expect(Exit.isSuccess(exit) && exit.value.generation).toBe(1);
  });

  it('lets a disposable table become persistent', () => {
    const exit = deploy(deployed({ mode: 'disposable', snapshot: v1 }), {
      mode: 'persistent',
      snapshot: v1,
    });
    expect(Exit.isSuccess(exit) && exit.value.mode).toBe('persistent');
  });

  it('refuses a persistent DynamoDB table a new local index, which would replace it', () => {
    const fixed = { fixedLocalIndexes: true } as const;
    const error = refusal(
      deploy(deployed({ mode: 'persistent', snapshot: v1, ...fixed }), {
        mode: 'persistent',
        snapshot: withLocalIndex,
        ...fixed,
      }),
    );
    expect((error as SetupRefused).reason).toBe('replaces-table');
  });

  it('replaces a disposable DynamoDB table for a new local index', () => {
    const fixed = { fixedLocalIndexes: true } as const;
    const exit = deploy(
      deployed({ mode: 'disposable', snapshot: v1, ...fixed }),
      { mode: 'disposable', snapshot: withLocalIndex, ...fixed },
    );
    expect(Exit.isSuccess(exit) && exit.value.generation).toBe(1);
  });

  it('starts a fresh contract for a new physical table', () => {
    const props = {
      mode: 'persistent',
      snapshot: v1,
      target: 'tasks',
    } as const;
    expect(diffContract(props, { ...props, target: 'tasks-2' })).toEqual({
      action: 'replace',
    });
    expect(diffContract(props, props)).toEqual({ action: 'noop' });
  });
});
