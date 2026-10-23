import { describe, expect, it } from 'vitest';
import { Schema, SchemaGetter } from 'effect';
import { EntityESchema, ESchema, ValueESchema } from '../../index.js';
import { expectUpgradable } from '../index.js';

const Priority = ValueESchema.make('Priority', Schema.Literals(['low', 'high']))
  .evolve('v2', Schema.Literals(['low', 'mid', 'urgent']), (old) =>
    old === 'high' ? 'urgent' : old,
  )
  .build();

const Owner = ESchema.make('Owner', { name: Schema.String })
  .evolve('v2', { team: Schema.String }, (old) => ({ ...old, team: 'none' }))
  .build();

describe('expectUpgradable', () => {
  it('passes when every stored version upgrades, nested ones included', async () => {
    const Task = EntityESchema.make('Task', 'taskId', {
      title: Schema.String,
      owner: Owner.schema,
      priority: Priority.schema,
    })
      .evolve('v2', { due: Schema.DateFromString }, (old) => ({
        ...old,
        due: new Date(0),
      }))
      .evolve(
        'v3',
        { estimate: Schema.Finite, title: null },
        ({ title, ...rest }) => ({
          ...rest,
          estimate: title.length,
        }),
      )
      .build();
    await expect(expectUpgradable(Task, { runs: 50 })).resolves.toBeUndefined();
  });

  it('reports a migration that throws on some stored rows', async () => {
    const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
      .evolve('v2', { words: Schema.Finite }, (old) => {
        if (old.title.includes(' ')) throw new Error('cannot split titles yet');
        return { ...old, words: 1 };
      })
      .build();
    await expect(expectUpgradable(Task)).rejects.toThrow(
      /Task v1 → v2: upgrade failed: .*cannot split titles yet[\s\S]*stored row: \{.*"_v":"v1"\}/,
    );
  });

  it('reports a migration that changes the id', async () => {
    const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
      .evolve('v2', { done: Schema.Boolean }, (old) => ({
        ...old,
        taskId: `task-${old.taskId}`,
        done: false,
      }))
      .build();
    await expect(expectUpgradable(Task)).rejects.toThrow(
      /Task v1 → v2: identity failed: taskId changed/,
    );
  });

  it('reports a migration that changes a path it must leave unchanged', async () => {
    const Task = EntityESchema.make('Task', 'taskId', {
      owner: Schema.Struct({ teamId: Schema.String }),
    })
      .evolve('v2', { done: Schema.Boolean }, (old) => ({
        owner: { teamId: `team-${old.owner.teamId}` },
        taskId: old.taskId,
        done: false,
      }))
      .build();
    await expect(expectUpgradable(Task)).resolves.toBeUndefined();
    // An object path compares by content: the round trip copies it.
    const Kept = EntityESchema.make('Kept', 'keptId', {
      owner: Schema.Struct({ teamId: Schema.String }),
    })
      .evolve('v2', { done: Schema.Boolean }, (old) => ({
        ...old,
        done: false,
      }))
      .build();
    await expect(
      expectUpgradable(Kept, { unchanged: ['owner'] }),
    ).resolves.toBeUndefined();
    await expect(
      expectUpgradable(Task, { unchanged: ['owner.teamId'] }),
    ).rejects.toThrow(/Task v1 → v2: unchanged failed: owner.teamId changed/);
  });

  it('reports a migration whose result breaks the latest checks', async () => {
    const Task = EntityESchema.make('Task', 'taskId', { title: Schema.String })
      .evolve(
        'v2',
        { title: Schema.String.check(Schema.isMinLength(3)) },
        (old) => old,
      )
      .build();
    await expect(expectUpgradable(Task)).rejects.toThrow(
      /Task v1 → v2: upgrade failed/,
    );
  });

  it('reports a nested ESchema under its own name', async () => {
    const Address = ESchema.make('Address', { line: Schema.String })
      .evolve('v2', { city: Schema.String }, () => {
        throw new Error('city unknown');
      })
      .build();
    const Customer = EntityESchema.make('Customer', 'customerId', {
      address: Address.schema,
    }).build();
    await expect(expectUpgradable(Customer)).rejects.toThrow(
      /Address v1 → v2: upgrade failed: .*city unknown/,
    );
  });

  it('reports a conversion that changes the value on every read', async () => {
    const Shouting = Schema.String.pipe(
      Schema.decodeTo(Schema.String, {
        decode: SchemaGetter.transform((text: string) => `${text}!`),
        encode: SchemaGetter.transform((text: string) => text),
      }),
    );
    const Note = ESchema.make('Note', { text: Shouting }).build();
    await expect(expectUpgradable(Note)).rejects.toThrow(
      /Note v1: stable failed: saving and reading again gave/,
    );
  });

  it('checks that a value saved before versioning still reads', async () => {
    await expect(expectUpgradable(Priority)).resolves.toBeUndefined();
  });
});
