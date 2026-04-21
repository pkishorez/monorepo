import { Effect } from 'effect';
import {
  startExecuteWorkflow,
  continueExecuteWorkflow,
  stopExecuteWorkflow,
  removeExecuteWorkflow,
  archiveWorkflow,
} from './execute.js';

export class WorkflowOrchestrator extends Effect.Service<WorkflowOrchestrator>()(
  'WorkflowOrchestrator',
  {
    effect: Effect.succeed({
      execute: {
        start: startExecuteWorkflow,
        continue: continueExecuteWorkflow,
        stop: stopExecuteWorkflow,
        remove: removeExecuteWorkflow,
      },
      archive: archiveWorkflow,
    }),
  },
) {}
