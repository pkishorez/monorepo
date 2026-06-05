export type { OtelEvent, OtelSpan, OtelStatus } from './types';
export {
  collectSpans,
  groupByTrace,
  type SpanNode,
  type TraceGroup,
} from './trace-group';
export { formatDuration, formatSpanName, isLog, spanDuration } from './format';
export { attachLogs, transformLog, transformSpan } from './lotel-transform';
