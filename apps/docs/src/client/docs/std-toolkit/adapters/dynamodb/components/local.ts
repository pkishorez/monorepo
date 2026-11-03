import { Effect, Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { DynamoDB } from '@kestack/std-toolkit/db/dynamodb';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();

const table = StdTable.make('board').primary('pk', 'sk').build();
const task = table
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .build();

// DynamoDB Local on your machine. For a real region, drop `endpoint`.
const config = {
  tableName: 'board',
  region: 'local',
  endpoint: 'http://localhost:8090',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
};
const dynamodb = DynamoDB.make(table, config);

export const main = Effect.gen(function* () {
  // Local only: in production the table comes from your deploy.
  yield* DynamoDB.createTable(table, config);
  yield* task
    .insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' })
    .pipe(Effect.provide(dynamodb.layer));
}).pipe(Effect.ensuring(Effect.orDie(DynamoDB.deleteTable(config))));
