/* eslint-disable no-console */
import { Effect, Schema } from 'effect';
import { DynamoTableV2 } from './tablev2.js';
import { DynamoEntity } from './entity.js';
import { ESchema } from '@monorepo/eschema';

const table = DynamoTableV2.make({
  endpoint: 'http://localhost:8090',
  tableName: 'playground',
  credentials: {
    accessKeyId: 'access',
    secretAccessKey: 'access',
  },
})
  .primary('pkey', 'skey')
  .lsi('LSI1', 'lsi1sk')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi1pk', 'gsi1sk')
  .build();

const entity = DynamoEntity.make(table)
  .eschema(
    ESchema.make(
      'v1',
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        age: Schema.Number,
        comment: Schema.String,
      }),
    ).build(),
  )
  .primary({
    pk: { deps: [], derive: () => ['USER'] },
    sk: { deps: ['id'], derive: ({ id }) => [id] },
  })
  .build();

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

Effect.runPromise(
  Effect.gen(function* () {
    yield* table.purge('i know what i am doing');
    log(
      yield* entity.insert({
        id: 'test1',
        name: 'Test User 1',
        age: 1,
        comment: 'inserted',
      }),
    );
    log(yield* entity.update({ id: 'test1' }, { comment: 'Updated time 1' }));

    log(yield* entity.get({ id: 'test1' }));
  }),
);
