/* eslint-disable no-console */
import * as v from 'valibot';
import { Effect } from 'effect';
import { DynamoTable } from './table/table.js';
import { DynamoEntity } from './entity/entity.js';
import { filterExpr } from './table/expr/condition.js';
import { ESchema } from '@std-toolkit/eschema';

const table = DynamoTable.make({
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
    ESchema.make({
      id: v.string(),
      name: v.string(),
      age: v.number(),
      comment: v.string(),
    })
      .name('post')
      .build(),
  )
  .primary({
    pk: { deps: [], derive: () => ['USER'] },
    sk: { deps: ['id'], derive: ({ id }) => ['SK', id] },
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

    for (let i = 0; i < 2; i++) {
      yield* entity.insert({
        id: `test-${`${i}`.padStart(4, '0')}`,
        name: `Test User ${i}`,
        age: i,
        comment: 'inserted',
      });
    }
    yield* entity.update(
      { id: 'test-0001' },
      { comment: 'Updated time 1000' },
      {},
    );

    log(
      yield* entity.index('byName').query(
        {
          pk: {},
          sk: {
            '<=': { name: 'Test User 1' },
          },
        },
        {
          debug: true,
          ScanIndexForward: true,
          Limit: 10,
          filter: filterExpr(({ or, cond }) =>
            or(
              cond('age', '=', 10), // br
              cond('comment', '=', 'Updated time 1000'),
            ),
          ),
        },
      ),
    );
  }),
);
