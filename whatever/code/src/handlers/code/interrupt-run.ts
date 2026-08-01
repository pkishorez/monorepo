import { Effect } from 'effect';
import { CodeRpcs } from '../../contract/code/index.js';
import { codeNotImplemented } from './not-implemented.js';

export const InterruptRunHandlerLive = CodeRpcs.toLayerHandler(
  'interruptRun',
  () => Effect.fail(codeNotImplemented()),
);
