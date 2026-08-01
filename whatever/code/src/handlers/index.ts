import { Layer } from 'effect';
import { CodeHandlersLive } from './code/index.js';
import { HelloHandlersLive } from './hello/index.js';

export const WhateverHandlersLive = Layer.mergeAll(
  HelloHandlersLive,
  CodeHandlersLive,
);
