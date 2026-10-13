export interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: { values?: AnyValue[] };
  kvlistValue?: { values?: KeyValue[] };
  bytesValue?: string;
}

export interface KeyValue {
  key?: string;
  value?: AnyValue;
}

export interface InstrumentationScope {
  name?: string;
  version?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
}

export interface Resource {
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  schemaUrl?: string;
  entityRefs?: string[];
}

export interface SpanStatus {
  message?: string;
  code?: number;
}

export interface SpanEvent {
  timeUnixNano?: string | number;
  name?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
}

export interface SpanLink {
  traceId?: string;
  spanId?: string;
  traceState?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  flags?: number;
}

export interface OtlpSpan {
  traceId?: string;
  spanId?: string;
  traceState?: string;
  parentSpanId?: string;
  flags?: number;
  name?: string;
  kind?: number;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  events?: SpanEvent[];
  droppedEventsCount?: number;
  links?: SpanLink[];
  droppedLinksCount?: number;
  status?: SpanStatus;
}

export interface OtlpLogRecord {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: number;
  severityText?: string;
  body?: AnyValue;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  flags?: number;
  traceId?: string;
  spanId?: string;
  eventName?: string;
}

export interface TelemetryContext {
  resource?: Resource;
  instrumentationScope?: InstrumentationScope;
  resourceSchemaUrl?: string;
  scopeSchemaUrl?: string;
}

export interface ExportTraceServiceRequest {
  resourceSpans?: Array<{
    resource?: Resource;
    scopeSpans?: Array<{
      scope?: InstrumentationScope;
      spans?: OtlpSpan[];
      schemaUrl?: string;
    }>;
    schemaUrl?: string;
  }>;
}

export interface ExportLogsServiceRequest {
  resourceLogs?: Array<{
    resource?: Resource;
    scopeLogs?: Array<{
      scope?: InstrumentationScope;
      logRecords?: OtlpLogRecord[];
      schemaUrl?: string;
    }>;
    schemaUrl?: string;
  }>;
}
