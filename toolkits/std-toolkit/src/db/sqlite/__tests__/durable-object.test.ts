import BetterSqlite3 from 'better-sqlite3';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../index.js';
import {
  makeDurableObjectSQLite,
  type DurableObjectSQLiteStorage,
} from '../drivers/durable-object/index.js';
import { SQLite, type SQLiteDriver } from '../index.js';
import { fakeDurableObjectStorage } from './drivers.js';

const tasks = (title: Schema.Codec<string, string> = Schema.String) => {
  const table = StdTable.make('tasks').primary('pk', 'sk').build();
  const task = table
    .entity(EntityESchema.make('Task', 'taskId', { title }).build())
    .primary()
    .build();
  return { table, task };
};

/** The part of workerd's `DurableObjectState` the object uses. */
interface State {
  readonly storage: DurableObjectSQLiteStorage;
  readonly blockConcurrencyWhile: <T>(callback: () => Promise<T>) => Promise<T>;
}

/** A Durable Object as an app writes one: its table is set up in the constructor. */
class TasksObject {
  private readonly code: ReturnType<typeof tasks>;
  private readonly database: SQLiteDriver;
  /** workerd holds every request until this settles, and resets the object if it rejects. */
  readonly ready: Promise<void>;

  constructor(state: State, code: ReturnType<typeof tasks>) {
    this.code = code;
    this.database = makeDurableObjectSQLite({ storage: state.storage });
    this.ready = state.blockConcurrencyWhile(() =>
      Effect.runPromise(
        SQLite.setup(code.table, {
          database: this.database,
          mode: 'persistent',
        }),
      ),
    );
  }

  async add(taskId: string) {
    await this.ready;
    await Effect.runPromise(
      this.code.task
        .insert({ taskId, title: 'Write' })
        .pipe(
          Effect.provide(
            SQLite.make(this.code.table, { database: this.database }).layer,
          ),
        ),
    );
  }
}

const state = (database: BetterSqlite3.Database): State => ({
  storage: fakeDurableObjectStorage(database),
  blockConcurrencyWhile: (callback) => callback(),
});

describe('SQLite setup in a Durable Object', () => {
  it('sets up the table in the constructor, before any request', async () => {
    const database = new BetterSqlite3(':memory:');
    const object = new TasksObject(state(database), tasks());
    await object.add('t1');

    // The object restarts on the same storage under the same code.
    const restarted = new TasksObject(state(database), tasks());
    await restarted.add('t2');
    expect(
      database
        .prepare("SELECT count(*) AS n FROM tasks WHERE _e = 'Task'")
        .get(),
    ).toEqual({ n: 2 });
  });

  it('refuses to open under a breaking change, keeping its data', async () => {
    const database = new BetterSqlite3(':memory:');
    await new TasksObject(state(database), tasks()).add('t1');

    const broken = new TasksObject(
      state(database),
      tasks(Schema.String.check(Schema.isMaxLength(3))),
    );

    await expect(broken.ready).rejects.toMatchObject({
      _tag: 'SetupRefused',
      reason: 'breaking',
    });
    await expect(broken.add('t2')).rejects.toBeDefined();
    expect(
      database
        .prepare("SELECT count(*) AS n FROM tasks WHERE _e = 'Task'")
        .get(),
    ).toEqual({ n: 1 });
  });
});
