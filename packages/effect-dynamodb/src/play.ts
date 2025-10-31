/* eslint-disable no-console */
import { Effect, Schema } from 'effect';
import { DynamoTableV2 } from './table/table.js';
import { DynamoEntity } from './entity/entity.js';
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
    sk: { deps: ['id'], derive: ({ id }) => ['SK :: ', id] },
  })
  .index('GSI1', 'byName', {
    pk: { deps: [], derive: () => ['BYNAME'] },
    sk: { deps: ['name'], derive: ({ name }) => ['SK', name] },
  })
  .build();

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

Effect.runPromise(
  Effect.gen(function* () {
    yield* table.purge('i know what i am doing');

    for (let i = 0; i < 20; i++) {
      yield* entity.insert({
        id: `test-${`${i}`.padStart(4, '0')}`,
        name: `Test User ${i}`,
        age: i,
        comment: 'inserted',
      });
    }
    // log(
    //   yield* entity.update({ id: 'test-001' }, { comment: 'Updated time 1' }),
    // );

    const v = yield* entity.get({ id: 'test-1' });

    log(
      yield* entity.index('byName').query(
        {
          pk: {},
          sk: {
            '>': { name: 'Test User 1' },
          },
        },
        { debug: true, ScanIndexForward: true, Limit: 10 },
      ),
    );
  }),
);
