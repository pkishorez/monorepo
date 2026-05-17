import type {
  AnyValue,
  InstrumentationScope,
  KeyValue,
  Resource,
} from './common.js';

export enum SeverityNumber {
  SEVERITY_NUMBER_UNSPECIFIED = 0,
  SEVERITY_NUMBER_TRACE = 1,
  SEVERITY_NUMBER_TRACE2 = 2,
  SEVERITY_NUMBER_TRACE3 = 3,
  SEVERITY_NUMBER_TRACE4 = 4,
  SEVERITY_NUMBER_DEBUG = 5,
  SEVERITY_NUMBER_DEBUG2 = 6,
  SEVERITY_NUMBER_DEBUG3 = 7,
  SEVERITY_NUMBER_DEBUG4 = 8,
  SEVERITY_NUMBER_INFO = 9,
  SEVERITY_NUMBER_INFO2 = 10,
  SEVERITY_NUMBER_INFO3 = 11,
  SEVERITY_NUMBER_INFO4 = 12,
  SEVERITY_NUMBER_WARN = 13,
  SEVERITY_NUMBER_WARN2 = 14,
  SEVERITY_NUMBER_WARN3 = 15,
  SEVERITY_NUMBER_WARN4 = 16,
  SEVERITY_NUMBER_ERROR = 17,
  SEVERITY_NUMBER_ERROR2 = 18,
  SEVERITY_NUMBER_ERROR3 = 19,
  SEVERITY_NUMBER_ERROR4 = 20,
  SEVERITY_NUMBER_FATAL = 21,
  SEVERITY_NUMBER_FATAL2 = 22,
  SEVERITY_NUMBER_FATAL3 = 23,
  SEVERITY_NUMBER_FATAL4 = 24,
}

export interface LogRecord {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: SeverityNumber | number;
  severityText?: string;
  body?: AnyValue;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  flags?: number;
  traceId?: string;
  spanId?: string;
  eventName?: string;
}

export interface ScopeLogs {
  scope?: InstrumentationScope;
  logRecords?: LogRecord[];
  schemaUrl?: string;
}

export interface ResourceLogs {
  resource?: Resource;
  scopeLogs?: ScopeLogs[];
  schemaUrl?: string;
}

export interface ExportLogsServiceRequest {
  resourceLogs?: ResourceLogs[];
}

export interface ExportLogsPartialSuccess {
  rejectedLogRecords?: string | number;
  errorMessage?: string;
}

export interface ExportLogsServiceResponse {
  partialSuccess?: ExportLogsPartialSuccess;
}

export interface LogRecordContext {
  resource?: Resource;
  scope?: InstrumentationScope;
  schemaUrl?: string;
  scopeSchemaUrl?: string;
}
