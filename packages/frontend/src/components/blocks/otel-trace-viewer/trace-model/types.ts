export type OtelStatus = 'success' | 'error' | 'running' | 'unset';

export interface OtelEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, unknown>;
}

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  status: OtelStatus;
  attributes: Record<string, unknown>;
  events: OtelEvent[];
}
