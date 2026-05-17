import type {
  AnyValue,
  InstrumentationScope,
  KeyValue,
  Resource,
} from './common.js';

export enum SpanKind {
  SPAN_KIND_UNSPECIFIED = 0,
  SPAN_KIND_INTERNAL = 1,
  SPAN_KIND_SERVER = 2,
  SPAN_KIND_CLIENT = 3,
  SPAN_KIND_PRODUCER = 4,
  SPAN_KIND_CONSUMER = 5,
}

export enum StatusCode {
  STATUS_CODE_UNSET = 0,
  STATUS_CODE_OK = 1,
  STATUS_CODE_ERROR = 2,
}

export interface Status {
  message?: string;
  code?: StatusCode | number;
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

export interface Span {
  traceId?: string;
  spanId?: string;
  traceState?: string;
  parentSpanId?: string;
  flags?: number;
  name?: string;
  kind?: SpanKind | number;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
  events?: SpanEvent[];
  droppedEventsCount?: number;
  links?: SpanLink[];
  droppedLinksCount?: number;
  status?: Status;
}

export interface ScopeSpans {
  scope?: InstrumentationScope;
  spans?: Span[];
  schemaUrl?: string;
}

export interface ResourceSpans {
  resource?: Resource;
  scopeSpans?: ScopeSpans[];
  schemaUrl?: string;
}

export interface ExportTraceServiceRequest {
  resourceSpans?: ResourceSpans[];
}

export interface ExportTracePartialSuccess {
  rejectedSpans?: string | number;
  errorMessage?: string;
}

export interface ExportTraceServiceResponse {
  partialSuccess?: ExportTracePartialSuccess;
}

export interface TraceRecordContext {
  resource?: Resource;
  scope?: InstrumentationScope;
  schemaUrl?: string;
  scopeSchemaUrl?: string;
}

export type TraceAttributeValue = AnyValue;
