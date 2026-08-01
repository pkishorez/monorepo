import type { StreamChunk } from '@tanstack/ai';
import { Schema } from 'effect';
import { fromType, id } from 'std-toolkit/eschema';
import type { RunConfigurationInput } from '../../domain/run/index.js';

export const RunConfigurationInputSchema = fromType<RunConfigurationInput>();

export const RunStreamEventSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('started'),
    threadId: id('ThreadId'),
    runId: id('RunId'),
  }),
  Schema.Struct({
    _tag: Schema.Literal('chunk'),
    chunk: fromType<StreamChunk>(),
  }),
]);
