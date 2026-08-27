import { Effect, Schema } from 'effect';
import { useState } from 'react';
import { Ulid } from 'std-toolkit/core';
import { StdTable } from 'std-toolkit/db';
import { Memory } from 'std-toolkit/db/memory';
import { ESchema, EntityESchema } from 'std-toolkit/eschema';
import { StudioRpc, type StudioRpcClient } from 'std-toolkit/studio-rpc';
import { RpcTest } from 'effect/unstable/rpc';
import { useComponentLifecycle } from 'use-effect-ts';

import { Spinner } from '#components/ui/spinner';

import { StdToolkitStudio } from './std-toolkit-studio';

type FixtureKind =
  | 'exhaustive'
  | 'primary'
  | 'single'
  | 'empty'
  | 'snapshot-failure'
  | 'query-failure';

const richTable = StdTable.make('commerce-studio')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .gsi('GSI3', 'GSI3PK', 'GSI3SK')
  .build();

const accountSchema = EntityESchema.make('Account', 'accountId', {
  organizationId: Schema.String,
  createdAt: Schema.String,
  email: Schema.String,
  status: Schema.Literals(['active', 'invited', 'suspended']),
  active: Schema.Boolean,
  balance: Schema.Number,
  profile: Schema.Struct({
    displayName: Schema.String,
    tags: Schema.Array(Schema.String),
    address: Schema.Struct({
      city: Schema.String,
      country: Schema.String,
    }),
  }),
  contact: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal('email'),
      address: Schema.String,
    }),
    Schema.Struct({
      kind: Schema.Literal('phone'),
      number: Schema.String,
    }),
  ]),
}).build();

const account = richTable
  .entity(accountSchema)
  .primary({ pk: ['organizationId'] })
  .index('LSI1', 'byCreatedAt', { sk: ['createdAt'] })
  .index('GSI1', 'byEmail', { pk: ['email'], sk: ['createdAt'] })
  .index('GSI2', 'byStatus', {
    pk: ['organizationId', 'status'],
    sk: ['createdAt'],
  })
  .index('GSI3', 'byStatusAndContact', {
    pk: ['organizationId', 'status'],
    sk: ['createdAt', 'email'],
  })
  .build();

richTable
  .singleEntity(
    ESchema.make('Settings', {
      theme: Schema.Literals(['light', 'dark', 'system']),
      auditEnabled: Schema.Boolean,
      pageTitle: Schema.String,
    }).build(),
  )
  .default({
    theme: 'system',
    auditEnabled: true,
    pageTitle: 'Commerce Console',
  });

const primaryTable = StdTable.make('primary-records')
  .primary('pk', 'sk')
  .build();
const event = primaryTable
  .entity(
    EntityESchema.make('Event', 'eventId', {
      stream: Schema.String,
      title: Schema.String,
      severity: Schema.Literals(['info', 'warning', 'error']),
      acknowledged: Schema.Boolean,
      count: Schema.Number,
    }).build(),
  )
  .primary({ pk: ['stream'] })
  .build();

const singleTable = StdTable.make('single-entity-studio')
  .primary('pk', 'sk')
  .build();
singleTable
  .singleEntity(
    ESchema.make('RuntimeSettings', {
      environment: Schema.String,
      maintenanceMode: Schema.Boolean,
      maxConnections: Schema.Number,
      regions: Schema.Array(Schema.String),
    }).build(),
  )
  .default({
    environment: 'development',
    maintenanceMode: false,
    maxConnections: 24,
    regions: ['ap-south-1', 'eu-west-1'],
  });

const emptyTable = StdTable.make('empty-studio').primary('pk', 'sk').build();

const richSeed = Effect.gen(function* () {
  yield* Effect.forEach(
    Array.from({ length: 36 }, (_, index) => index),
    (index) => {
      const number = String(index + 1).padStart(3, '0');
      const status = (['active', 'invited', 'suspended'] as const)[index % 3]!;
      return account.insert({
        organizationId: index < 30 ? 'acme' : 'globex',
        accountId: `account-${number}`,
        createdAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T${String(
          index % 24,
        ).padStart(2, '0')}:00:00Z`,
        email: `person${number}@example.com`,
        status,
        active: status === 'active',
        balance: 1000 + index * 137.5,
        profile: {
          displayName: `Person ${number}`,
          tags: index % 2 === 0 ? ['customer', 'priority'] : ['customer'],
          address: {
            city: index % 2 === 0 ? 'Bengaluru' : 'London',
            country: index % 2 === 0 ? 'IN' : 'GB',
          },
        },
        contact:
          index % 2 === 0
            ? { kind: 'email' as const, address: `person${number}@example.com` }
            : { kind: 'phone' as const, number: `+91-90000${number}` },
      });
    },
    { concurrency: 8, discard: true },
  );
  yield* account.delete({ organizationId: 'acme', accountId: 'account-009' });
});

const primarySeed = Effect.forEach(
  Array.from({ length: 31 }, (_, index) => index),
  (index) =>
    event.insert({
      stream: 'operations',
      eventId: `event-${String(index + 1).padStart(3, '0')}`,
      title: `Operational event ${index + 1}`,
      severity: (['info', 'warning', 'error'] as const)[index % 3]!,
      acknowledged: index % 4 === 0,
      count: index + 1,
    }),
  { concurrency: 8, discard: true },
);

const failMethod = (
  client: StudioRpcClient<unknown>,
  tag: keyof StudioRpcClient<unknown>,
  message: string,
): StudioRpcClient<unknown> =>
  new Proxy(client, {
    get(target, property, receiver) {
      if (property === tag) return () => Effect.fail(new Error(message));
      return Reflect.get(target, property, receiver);
    },
  });

function makeRpcClient(kind: FixtureKind) {
  return Effect.gen(function* () {
    const client = (yield* RpcTest.makeClient(
      StudioRpc,
    )) as StudioRpcClient<unknown>;
    if (kind === 'snapshot-failure') {
      return failMethod(
        client,
        'Studio.GetTableSnapshot',
        'The fixture RPC endpoint is unavailable.',
      );
    }
    if (kind === 'query-failure') {
      return failMethod(
        client,
        'Studio.QueryEntities',
        'The fixture rejected this query.',
      );
    }
    return client;
  });
}

function makeFixtureClient(kind: FixtureKind) {
  let issued = 0;
  const nextUlid = () => String(++issued).padStart(26, '0');
  if (kind === 'single') {
    return makeRpcClient(kind).pipe(
      Effect.provide(StudioRpc.layer(singleTable)),
      Effect.provide(Memory.make(singleTable).layer),
      Effect.provideService(Ulid, nextUlid),
    );
  }
  if (kind === 'empty') {
    return makeRpcClient(kind).pipe(
      Effect.provide(StudioRpc.layer(emptyTable)),
      Effect.provide(Memory.make(emptyTable).layer),
      Effect.provideService(Ulid, nextUlid),
    );
  }
  if (kind === 'primary') {
    return Effect.andThen(primarySeed, makeRpcClient(kind)).pipe(
      Effect.provide(StudioRpc.layer(primaryTable)),
      Effect.provide(Memory.make(primaryTable).layer),
      Effect.provideService(Ulid, nextUlid),
    );
  }
  return Effect.andThen(richSeed, makeRpcClient(kind)).pipe(
    Effect.provide(StudioRpc.layer(richTable)),
    Effect.provide(Memory.make(richTable).layer),
    Effect.provideService(Ulid, nextUlid),
  );
}

function MemoryStudioFixture({
  kind,
}: {
  readonly kind: FixtureKind;
  readonly testKeys: Readonly<Record<string, string>>;
}) {
  const [state, setState] = useState<
    | { readonly kind: 'loading' }
    | { readonly kind: 'failure'; readonly message: string }
    | { readonly kind: 'ready'; readonly client: StudioRpcClient<unknown> }
  >({ kind: 'loading' });

  useComponentLifecycle(
    makeFixtureClient(kind).pipe(
      Effect.match({
        onFailure: (error) =>
          setState({
            kind: 'failure',
            message: error instanceof Error ? error.message : String(error),
          }),
        onSuccess: (client) => setState({ kind: 'ready', client }),
      }),
    ),
    { deps: [kind] },
  );

  if (state.kind === 'loading') {
    return (
      <div className="grid min-h-[640px] place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (state.kind === 'failure') return <p>{state.message}</p>;
  return <StdToolkitStudio rpcClient={state.client} />;
}

export default {
  'Exhaustive · Primary, LSI, GSI, complex, union, tombstone': (
    <MemoryStudioFixture
      kind="exhaustive"
      testKeys={{
        primary: 'Account → primary: organizationId = acme',
        lsi: 'Account → byCreatedAt (LSI1): organizationId = acme',
        gsiEmail: 'Account → byEmail (GSI1): email = person001@example.com',
        gsiStatus:
          'Account → byStatus (GSI2): organizationId = acme, status = active',
        composite:
          'Account → byStatusAndContact (GSI3): PK organizationId = acme + status = active; SK createdAt + email',
        pagination: 'Use primary with organizationId = acme and Rows = 10',
        tombstone: 'Primary result accountId = account-009',
        single: 'Select Settings to load its direct record',
      }}
    />
  ),
  'Primary · Simple values and pagination': (
    <MemoryStudioFixture
      kind="primary"
      testKeys={{
        query: 'Event → primary: stream = operations',
        pagination: 'Use Rows = 10, then Next and Previous',
      }}
    />
  ),
  'Single Entity · Direct record': (
    <MemoryStudioFixture
      kind="single"
      testKeys={{ direct: 'Select RuntimeSettings in the Query tab' }}
    />
  ),
  'Empty Table · No Entities': (
    <MemoryStudioFixture
      kind="empty"
      testKeys={{ expected: 'No Entity choices and an empty diagram' }}
    />
  ),
  'Failure · RPC snapshot unavailable': (
    <MemoryStudioFixture
      kind="snapshot-failure"
      testKeys={{ expected: 'Centered snapshot error with a Retry action' }}
    />
  ),
  'Failure · Query rejected': (
    <MemoryStudioFixture
      kind="query-failure"
      testKeys={{
        query: 'Account → primary: organizationId = acme',
        expected: 'Centered query error with a Retry action',
      }}
    />
  ),
};
