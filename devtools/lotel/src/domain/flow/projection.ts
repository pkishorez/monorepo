import { projectFlow } from '@pkishorez/effect-tracer/flow';
import type { DecodedEntity } from 'std-toolkit/core';
import type { LogRecord, SpanRecord } from '../telemetry-schema/index.js';
import type { FlowEntity } from './flow.js';
import {
  logObservation,
  spanObservation,
  unixNanosToMilliseconds,
} from './otlp-adapter.js';

export const projectStoredFlow = (
  flow: DecodedEntity<FlowEntity>,
  spans: DecodedEntity<SpanRecord>[],
  logs: DecodedEntity<LogRecord>[],
) =>
  projectFlow({
    id: flow.value.flowId,
    latestTimestamp: unixNanosToMilliseconds(flow.value.latestTimeUnixNano),
    observations: [...spans.map(spanObservation), ...logs.map(logObservation)],
  });
