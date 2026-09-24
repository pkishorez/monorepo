import { StdTable } from 'std-toolkit/db';
import type {
  AccessPatternDefinition,
  GlobalSecondaryIndex,
  KeyedEntity,
  PrimaryIndex,
  StdTable as StdTableType,
} from 'std-toolkit/db';
import { MessageSchema, RunSchema, ThreadSchema } from './schemas/index.js';

export {
  MESSAGE_ROLES,
  MessageSchema,
  RunSchema,
  ThreadSchema,
  type Message,
  type MessageRole,
  type Run,
  type Thread,
} from './schemas/index.js';

// GSI1 holds per-Thread feeds, GSI2 holds global feeds, GSI3-5 are reserved.
type AiTable = StdTableType<
  'kai-toolkit',
  PrimaryIndex<'pk', 'sk'>,
  {},
  {
    GSI1: GlobalSecondaryIndex<'GSI1', 'GSI1PK', 'GSI1SK'>;
    GSI2: GlobalSecondaryIndex<'GSI2', 'GSI2PK', 'GSI2SK'>;
    GSI3: GlobalSecondaryIndex<'GSI3', 'GSI3PK', 'GSI3SK'>;
    GSI4: GlobalSecondaryIndex<'GSI4', 'GSI4PK', 'GSI4SK'>;
    GSI5: GlobalSecondaryIndex<'GSI5', 'GSI5PK', 'GSI5SK'>;
  }
>;

type ThreadEntity = KeyedEntity<
  'kai-toolkit',
  typeof ThreadSchema,
  readonly [],
  {
    primary: AccessPatternDefinition<
      undefined,
      'primary',
      readonly [],
      readonly ['id']
    >;
    byUpdate: AccessPatternDefinition<
      'GSI2',
      'gsi',
      readonly [],
      readonly ['_u']
    >;
  }
>;

type RunEntity = KeyedEntity<
  'kai-toolkit',
  typeof RunSchema,
  readonly ['threadId'],
  {
    primary: AccessPatternDefinition<
      undefined,
      'primary',
      readonly ['threadId'],
      readonly ['id']
    >;
    byThreadUpdate: AccessPatternDefinition<
      'GSI1',
      'gsi',
      readonly ['threadId'],
      readonly ['_u']
    >;
    byUpdate: AccessPatternDefinition<
      'GSI2',
      'gsi',
      readonly [],
      readonly ['_u']
    >;
  }
>;

type MessageEntity = KeyedEntity<
  'kai-toolkit',
  typeof MessageSchema,
  readonly ['runId'],
  {
    primary: AccessPatternDefinition<
      undefined,
      'primary',
      readonly ['runId'],
      readonly ['id']
    >;
    byThreadUpdate: AccessPatternDefinition<
      'GSI1',
      'gsi',
      readonly ['threadId'],
      readonly ['_u']
    >;
  }
>;

export const aiTable: AiTable = StdTable.make('kai-toolkit')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .gsi('GSI3', 'GSI3PK', 'GSI3SK')
  .gsi('GSI4', 'GSI4PK', 'GSI4SK')
  .gsi('GSI5', 'GSI5PK', 'GSI5SK')
  .build();

export const threads: ThreadEntity = aiTable
  .entity(ThreadSchema)
  .primary()
  .index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] })
  .build();

export const runs: RunEntity = aiTable
  .entity(RunSchema)
  .primary({ pk: ['threadId'] })
  .index('GSI1', 'byThreadUpdate', { pk: ['threadId'], sk: ['_u'] })
  .index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] })
  .build();

export const messages: MessageEntity = aiTable
  .entity(MessageSchema)
  .primary({ pk: ['runId'] })
  .index('GSI1', 'byThreadUpdate', { pk: ['threadId'], sk: ['_u'] })
  .build();
