import { Schema } from 'effect';
import {
  flowStatuses,
  type RecordedFlow,
  type TerminalFlowStatus,
} from '@pkishorez/effect-tracer/flow';
import { EntitySchema, type EntityType } from 'std-toolkit/core';
import { EntityESchema, fromType } from 'std-toolkit/eschema';
import type { LogRecord, SpanRecord } from '../telemetry-schema/index.js';
import { readFlowIdentity, readTerminalStatus } from './attributes.js';
import { advanceFlow } from './lifecycle.js';
import { projectStoredFlow } from './projection.js';

export const FlowStatusSchema = Schema.Literals(flowStatuses);

export const FlowEntitySchema = EntityESchema.make('Flow', 'flowId', {
  latestTimeUnixNano: Schema.String,
  status: FlowStatusSchema,
}).build();

export type FlowEntity = typeof FlowEntitySchema.Type;

export const RecordedFlowSchema = fromType<RecordedFlow>();

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
  terminalStatus: readTerminalStatus(record.log.attributes),
});

export const updateFlowEntity = (
  flowId: string,
  latestTimeUnixNano: string,
  terminalStatus: TerminalFlowStatus | undefined,
  current?: FlowEntity,
) =>
  advanceFlow(
    flowId,
    latestTimeUnixNano,
    terminalStatus,
    current,
  ) as FlowEntity;

export const makeRecordedFlow = (
  flow: EntityType<FlowEntity>,
  spans: EntityType<SpanRecord>[],
  logs: EntityType<LogRecord>[],
) => projectStoredFlow(flow, spans, logs);
