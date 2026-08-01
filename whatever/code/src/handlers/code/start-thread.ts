import { Stream } from 'effect';
import { CodeRpcs } from '../../contract/code/index.js';
import { codeNotImplemented } from './not-implemented.js';

export const StartThreadHandlerLive = CodeRpcs.toLayerHandler(
  'startThread',
  () => Stream.fail(codeNotImplemented()),
);
