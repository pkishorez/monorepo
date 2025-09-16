/* eslint-disable no-console */
import { Effect } from 'effect';
import { DynamoTable } from './table/table.js';

const table = DynamoTable.make('playground', {
  endpoint: 'http://localhost:8090',
  accessKey: 'access',
  secretKey: 'access',
})
  .primary('pkey', 'skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .build<{
    name: string;
    age?: number;
    metadata: {
      college: {
        name: string;
        friends: string[][];
      };
      company: {
        name: string;
        duration: number;
      }[];
    };
  }>();

Effect.runPromise(
  Effect.gen(function* () {
    yield* table.putItem(
      { pkey: 'user', skey: 'user' },
      {
        name: 'Kishore',
        metadata: {
          college: {
            name: 'IIIT',
            friends: [['Friend 1', 'Friend 2']],
          },
          company: [
            {
              name: 'Wipro',
              duration: 2,
            },
          ],
        },
      },
      {
        returnValues: 'ALL_OLD',
        // condition: {},
      },
    );
    yield* table.updateItem(
      { pkey: 'user', skey: 'user' },
      {
        update: {
          'metadata.college.friends[0][0]': 'test friend',
        },
      },
    );
    const { Items } = yield* table.query(
      { pk: 'user', sk: { beginsWith: 'user' } },
      {
        Select: 'ALL_ATTRIBUTES',
        filter: {
          'metadata.college.friends[0][0]': 'test friend',
        },
        // projection: ['pkey'],
      },
    );

    console.dir(
      {
        Items,
        // Item: (yield* table.getItem(
        //   { pkey: 'user', skey: 'user' },
        //   {
        //     projection: ['name', 'pkey'],
        //   },
        // )).Item,
      },
      { depth: 10 },
    );
  }),
);
