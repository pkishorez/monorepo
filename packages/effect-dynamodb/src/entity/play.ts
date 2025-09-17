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
    createdAt: Schema.String,
    status: Schema.Literal('ACTIVE', 'INACTIVE', 'DELETED'),
    metadata: Schema.Struct({
      nested: Schema.String,
    }),
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
  })
  .prefix('byStatus', {
    deps: ['status'],
    derive: ({ status }) => `PROFILE#${status}`,
  })
  .build();

const gen = Effect.gen(function* () {
  // Create 5 user items with all required fields
  const userArbitrary = Arbitrary.make(eschema.schemaWithVersion);
  const users = FastCheck.sample(userArbitrary, 10);

  // Put all users into DynamoDB
  console.warn('INSERTING USER>>>');
  for (const user of users) {
    console.dir(user, { depth: 10 });
    yield* userEntity.put(user);
  }

  // Query to verify the insertions
  console.log('\n--- Querying all inserted users ---');
  const result = yield* userEntity
    .query({}, { ScanIndexForward: false })
    .exec();
  console.dir(result, { depth: 10 });
});

void Effect.runPromise(gen);
