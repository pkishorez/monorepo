/* eslint-disable no-console */
import { ESchema } from '@monorepo/eschema';
import { Array, Effect, Schema } from 'effect';
import { DynamoTable } from '../table/index.js';
import { DynamoEntity } from './entity.js';
import { Simplify } from 'type-fest';

const table = DynamoTable.make('playground', {
  endpoint: 'http://localhost:8090',
  accessKey: 'access',
  secretKey: 'access',
})
  .primary('pkey', 'skey')
  .gsi('GSI1', 'gsi1pk', 'gsi1sk')
  .gsi('GSI2', 'gsi2pk', 'gsi2sk')
  .build();

const eschema = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    name: Schema.String,
    age: Schema.Number.pipe(Schema.between(18, 25)),
    email: Schema.String,
    status: Schema.Literal('ACTIVE', 'INACTIVE', 'DELETED'),
    nested: Schema.Struct({
      a: Schema.Struct({
        b: Schema.String,
      }),
    }),
  }),
).build();

// Create entity using the fluent builder API with full type safety
export const userEntity = DynamoEntity.make({ eschema, table })
  .primary({
    pk: {
      deps: [],
      derive: () => 'USER',
    },
    sk: {
      deps: ['userId', 'status'],
      derive: ({ userId, status }) => `PROFILE#${status}#${userId}`,
    },
    accessPatterns: (fn) => ({
      byStatus: fn({
        deps: ['status'],
        derive: ({ status }) => `PROFILE#${status}`,
      }),
    }),
  })
  .index('GSI1', {
    pk: {
      deps: [],
      derive: () => 'USER',
    },
    sk: {
      deps: ['userId', 'status'],
      derive: ({ userId, status }) => `USER#${userId}#${status}`,
    },
    accessPatterns: (fn) => ({
      byTest: fn({
        deps: ['status'],
        derive: ({ status }) => status,
      }),
    }),
  })
  .build();
type T = Simplify<typeof userEntity.primary>['pk'];

const gen = Effect.gen(function* () {
  // Create 5 user items with all required fields
  console.warn('PURGED: ', yield* userEntity.purge('i know what i am doing'));

  // Put all users into DynamoDB
  console.warn('INSERTING USER>>>');
  yield* Effect.all(
    Array.range(1, 1).map((v) =>
      userEntity.put(
        eschema.make({
          userId: 'kishorez' + v,
          email: 'kishore.iiitn@gmail.com',
          status: 'ACTIVE',
          age: 18,
          name: 'KIshore',
          nested: {
            a: {
              b: 'testing',
            },
          },
        }),
      ),
    ),
  );
  const result = yield* userEntity
    .query({}, { onExcessProperty: 'preserve' })
    .exec();

  console.dir(result, { depth: 10 });
  yield* userEntity.update(
    { userId: 'kishorez1', status: 'ACTIVE' },
    {
      age: 18,
      name: 'KIshore',
      nested: {
        a: {
          b: 'updatedddd',
        },
      },
    },
  );
  const result2 = yield* userEntity
    .query({}, { onExcessProperty: 'preserve' })
    .exec();

  console.dir(result2, { depth: 10 });
});

Effect.runPromise(gen).catch(console.error);
