import { Effect, Schema } from 'effect';
import { EntityESchema } from '@std-toolkit/eschema';
import {
  DynamoTable,
  DynamoEntity,
  createDynamoDB,
} from '@std-toolkit/db-dynamodb';
import { vdescribe, vtest } from '@monorepo/vtest';

const config = (tableName: string) => ({
  tableName,
  region: 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  endpoint: 'http://localhost:8090',
});

const NoteSchema = EntityESchema.make('Note', 'noteId', {
  text: Schema.String,
}).build();

vdescribe(
  'one table, provisioned from its own derived schema',
  'createTable uses table.getTableSchema(); the client makes it real',
  () => {
    vtest(
      'createTable then a write succeeds against DynamoDB Local',
      'the table is a description; the client + createTable make it real',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            const cfg = config(`vtest-shared-${Date.now()}`);
            const table = DynamoTable.make(cfg).primary('pk', 'sk').build();
            const notes = DynamoEntity.make(table)
              .eschema(NoteSchema)
              .primary()
              .build();
            const client = createDynamoDB(cfg);

            yield* client.createTable({
              TableName: cfg.tableName,
              ...table.getTableSchema(),
            });

            const written = yield* notes.insert({
              noteId: 'n1',
              text: 'hello',
            });
            if (written.value.text !== 'hello') {
              throw new Error('expected the stored note back');
            }

            yield* client.deleteTable({ TableName: cfg.tableName });
          }),
        ),
    );

    vtest(
      'getTableSchema describes the keys the entities expect',
      'the physical table can never drift from the entity key shape',
      () =>
        Effect.runPromise(
          Effect.gen(function* () {
            yield* Effect.void;
            const cfg = config(`vtest-schema-${Date.now()}`);
            const table = DynamoTable.make(cfg)
              .primary('pk', 'sk')
              .gsi('GSI1', 'GSI1PK', 'GSI1SK')
              .build();

            const schema = table.getTableSchema();
            const keyNames = schema.KeySchema.map((k) => k.AttributeName);
            if (keyNames.join(',') !== 'pk,sk') {
              throw new Error('expected pk,sk key schema');
            }
            if (!schema.GlobalSecondaryIndexes?.length) {
              throw new Error('expected the reserved GSI in the schema');
            }
          }),
        ),
    );
  },
);
