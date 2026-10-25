import { StdTable } from '@kestack/std-toolkit/db';
import { RawSchema } from '@kestack/ai-toolkit/contract';
import {
  HarnessConfigSchema,
  ProjectSchema,
  SessionSchema,
} from '../../../records/index.js';

/*
 * One table holds everything: GSI1 holds a session's Raw in write order,
 * GSI2 the global feeds of projects, sessions and harness configs.
 */
export const aiTable = StdTable.make('ai-toolkit')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .build();

export const raws = aiTable
  .entity(RawSchema)
  .primary({ pk: ['sessionId'] })
  .index('GSI1', 'bySession', { pk: ['sessionId'], sk: ['_u'] })
  .build();

export const projects = aiTable
  .entity(ProjectSchema)
  .primary()
  .index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] })
  .build();

export const sessions = aiTable
  .entity(SessionSchema)
  .primary()
  .index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] })
  .build();

export const harnessConfigs = aiTable
  .entity(HarnessConfigSchema)
  .primary()
  .index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] })
  .build();
