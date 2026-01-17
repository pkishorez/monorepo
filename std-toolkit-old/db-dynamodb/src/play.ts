/* eslint-disable no-console */
import * as v from 'valibot';
import { Effect } from 'effect';
import { DynamoTable } from './table/table.js';
import { DynamoEntity } from './entity/entity.js';
import { filterExpr } from './table/expr/condition.js';
import { makeESchema } from '@std-toolkit/eschema';
import { StdESchema } from '@std-toolkit/eschema/eschema-std.js';

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
    StdESchema.make(
      'post',
      makeESchema({
        id: v.string(),
        name: v.string(),
        age: v.number(),
        comment: v.string(),
      }).build(),
    )
      .key({ deps: ['id'], encode: ({ id }) => id })
      .build(),
  )
  .primary({
    pk: { deps: [], derive: () => ['USER'] },
    sk: { deps: ['id'], derive: ({ id }) => ['SK', id] },
  })
  .index('GSI1', 'byName', {
    pk: { deps: [], derive: () => ['BYNAME'] },
    sk: { deps: ['_u'], derive: ({ _u }) => ['SK', _u] },
  })
  .build();

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

Effect.runPromise(
  Effect.gen(function* () {
    yield* table.purge('i know what i am doing');

    yield* table.transactWriteItems(
      [0, 1].map((i) =>
        entity.opInsert(
          {
            id: `test-${`${i}`.padStart(4, '0')}`,
            name: `Test User ${i}`,
            age: i,
            comment: 'inserted',
          },
          // { debug: true },
        ),
      ),
    );

    yield* table
      .transactWriteItems([
        yield* entity.opUpdate(
          { id: 'test-0001' },
          { comment: 'Updated time 1000' },
          { meta: { _i: 1 } },
        ),
      ])
      .pipe(
        Effect.catchTag('TransactionCanceledException', (err) => {
          console.error('ERR: ', err.CancellationReasons);
          return Effect.succeed(null);
        }),
      );

    log(
      yield* entity.index('byName').query(
        {
          pk: {},
          sk: {
            '<=': { _u: new Date().toISOString() },
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
