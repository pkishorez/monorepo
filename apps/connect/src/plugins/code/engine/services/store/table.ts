import { StdTable } from '@kestack/std-toolkit/db';
import { RawSchema } from '@kestack/ai-toolkit/contract';
import {
  HarnessAccountSchema,
  ProjectSchema,
  SessionSchema,
} from '../../../records/index.js';

/*
 * One table holds everything: GSI1 holds a session's Raw in write order,
 * GSI2 the global feeds of projects, sessions and Harness Accounts.
 */
export const aiTable = StdTable.make('ai-toolkit')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .gsi('GSI2', 'GSI2PK', 'GSI2SK')
  .entity(RawSchema, (e) =>
    e
      .primary({ pk: ['sessionId'] })
      .index('GSI1', 'bySession', { pk: ['sessionId'], sk: ['_u'] }),
  )
  .entity(ProjectSchema, (e) =>
    e.primary().index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] }),
  )
  .entity(SessionSchema, (e) =>
    e.primary().index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] }),
  )
  .entity(HarnessAccountSchema, (e) =>
    e.primary().index('GSI2', 'byUpdate', { pk: [], sk: ['_u'] }),
  )
  .build();

export const raws = aiTable.AiRaw;
export const projects = aiTable.AiProject;
export const sessions = aiTable.AiSession;
export const harnessAccounts = aiTable.AiHarnessConfig;
