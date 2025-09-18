/* eslint-disable no-console */
import { ESchema } from '@monorepo/eschema';
import { Arbitrary, Effect, FastCheck, Schema } from 'effect';
import { DynamoTable } from '../table/index.js';
import { DynamoEntity } from './entity.js';

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
  }),
).build();

// Create entity using the fluent builder API with full type safety
export const userEntity = DynamoEntity.make({ eschema, table })
  .primary({
    pk: 'USER',
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
    pk: 'test',
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
  .index('GSI2', {
    pk: 'GSI2',
    sk: { deps: ['status'], derive: ({ status }) => status },
  })
  .build();

const gen = Effect.gen(function* () {
  // Create 5 user items with all required fields
  console.warn('PURGED: ', yield* userEntity.purge('i know what i am doing'));

  const userArbitrary = Arbitrary.make(eschema.schemaWithVersion);

  // Put all users into DynamoDB
  console.warn('INSERTING USER>>>');
  yield* userEntity.put(
    eschema.make({
      userId: 'kishorez',
      email: 'kishore.iiitn@gmail.com',
      status: 'ACTIVE',
      age: 18,
      name: 'KIshore',
    }),
  );
  yield* userEntity.update(
    {},
    eschema.make({
      userId: 'kishorez',
      email: 'kishore.iiitn@gmail.com',
      status: 'ACTIVE',
      age: 18,
      name: 'KIshore',
    }),
  );

  // Query to verify the insertions

  // With typo: byTet instead of byTest - TypeScript will catch this!
  // const result = yield* userEntity.index('GSI1').query({}).byTet.prefix({ status: 'ACTIVE' });
  //                                                            ^^^^ Property 'byTet' does not exist

  // Correct usage:
  const result = yield* userEntity.query({}).exec();

  console.dir(result, { depth: 10 });
});

Effect.runPromise(gen).catch(console.error);
