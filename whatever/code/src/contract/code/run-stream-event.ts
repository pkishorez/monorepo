import type { StreamChunk } from '@tanstack/ai';
import { Schema } from 'effect';
import { fromType, id } from 'std-toolkit/eschema';

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

export type RunStreamEvent = typeof RunStreamEventSchema.Type;
