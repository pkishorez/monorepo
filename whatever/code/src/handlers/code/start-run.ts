import { Stream } from 'effect';
import { CodeRpcs } from '../../contract/code/index.js';
import { codeNotImplemented } from './not-implemented.js';

export const StartRunHandlerLive = CodeRpcs.toLayerHandler('startRun', () =>
  Stream.fail(codeNotImplemented()),
);
