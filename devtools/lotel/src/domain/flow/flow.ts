import { Schema } from 'effect';
import { RecordedFlowSchema as SharedRecordedFlowSchema } from '@pkishorez/effect-tracer/flow';
import { EntitySchema, type EntityType } from 'std-toolkit/core';
import { EntityESchema } from 'std-toolkit/eschema';
import type { LogRecord, SpanRecord } from '../telemetry-schema/index.js';
import { readFlowIdentity } from './attributes.js';
import { projectStoredFlow } from './projection.js';

export const FlowEntitySchema = EntityESchema.make('Flow', 'flowId', {
  latestTimeUnixNano: Schema.String,
}).build();

export type FlowEntity = typeof FlowEntitySchema.Type;

export const RecordedFlowSchema = SharedRecordedFlowSchema;

export const FlowListSchema = Schema.Struct({
  items: Schema.Array(EntitySchema(FlowEntitySchema)),
});

export class FlowNotFound extends Schema.TaggedErrorClass<FlowNotFound>(
  'FlowNotFound',
)('FlowNotFound', { flowId: Schema.String }) {}

const timeString = (value: string | number | undefined) =>
  value === undefined ? '0' : String(value);

export const prepareFlowSpan = (record: SpanRecord) => ({
  record: { ...record, ...readFlowIdentity(record.span.attributes) },
  latestTimeUnixNano: timeString(
    record.span.endTimeUnixNano ?? record.span.startTimeUnixNano,
  ),
});

export const prepareFlowLog = (record: LogRecord) => ({
  record: { ...record, ...readFlowIdentity(record.log.attributes) },
  latestTimeUnixNano: timeString(
    record.log.timeUnixNano ?? record.log.observedTimeUnixNano,
  ),
});

const compareTime = (left: string, right: string) => {
  try {
    const leftTime = BigInt(left);
    const rightTime = BigInt(right);
    return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0;
  } catch {
    return left.localeCompare(right);
  }
};

export const updateFlowEntity = (
  flowId: string,
  latestTimeUnixNano: string,
  current?: FlowEntity,
): FlowEntity => ({
  flowId,
  latestTimeUnixNano:
    current && compareTime(current.latestTimeUnixNano, latestTimeUnixNano) > 0
      ? current.latestTimeUnixNano
      : latestTimeUnixNano,
});

export const makeRecordedFlow = (
  flow: EntityType<FlowEntity>,
  spans: EntityType<SpanRecord>[],
  logs: EntityType<LogRecord>[],
) => projectStoredFlow(flow, spans, logs);
