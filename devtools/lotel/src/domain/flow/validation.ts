import { flowItemTypes } from '@pkishorez/effect-tracer/flow';
import type { EntityType } from 'std-toolkit/core';
import type { LogRecord, SpanRecord } from '../telemetry-schema/index.js';
import { readFlowAttribute } from './attributes.js';

interface Warning {
  readonly recordType: 'span' | 'log';
  readonly recordId: string;
  readonly message: string;
}

export const validateFlowRecords = (
  spans: EntityType<SpanRecord>[],
  logs: EntityType<LogRecord>[],
) => {
  const warnings: Warning[] = [];
  const validSpans = spans.filter((record) => {
    if (record.value.participantName) return true;
    warnings.push({
      recordType: 'span',
      recordId: `${record.value.traceId}:${record.value.spanId}`,
      message: 'Flow Span is missing flow.participant.name.',
    });
    return false;
  });
  const validLogs = logs.filter((record) => {
    if (!record.value.participantName) {
      warnings.push({
        recordType: 'log',
        recordId: record.value.id,
        message: 'Flow Log Record is missing flow.participant.name.',
      });
      return false;
    }
    if (
      readFlowAttribute(record.value.log.attributes, 'itemType') ===
        flowItemTypes.message &&
      !readFlowAttribute(record.value.log.attributes, 'messageTo')
    ) {
      warnings.push({
        recordType: 'log',
        recordId: record.value.id,
        message: 'Flow Message is missing flow.message.to.',
      });
      return false;
    }
    return true;
  });

  return { spans: validSpans, logs: validLogs, warnings };
};
