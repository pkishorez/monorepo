import type {
  Exemplars,
  InstrumentationScope,
  KeyValue,
  Resource,
} from './common.js';

export enum AggregationTemporality {
  AGGREGATION_TEMPORALITY_UNSPECIFIED = 0,
  AGGREGATION_TEMPORALITY_DELTA = 1,
  AGGREGATION_TEMPORALITY_CUMULATIVE = 2,
}

export interface NumberDataPoint {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  asDouble?: number;
  asInt?: string | number;
  exemplars?: Exemplars[];
  flags?: number;
}

export interface HistogramDataPoint {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  bucketCounts?: Array<string | number>;
  explicitBounds?: number[];
  exemplars?: Exemplars[];
  flags?: number;
  min?: number;
  max?: number;
}

export interface ExponentialHistogramDataPointBuckets {
  offset?: number;
  bucketCounts?: Array<string | number>;
}

export interface ExponentialHistogramDataPoint {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  scale?: number;
  zeroCount?: string | number;
  positive?: ExponentialHistogramDataPointBuckets;
  negative?: ExponentialHistogramDataPointBuckets;
  flags?: number;
  exemplars?: Exemplars[];
  min?: number;
  max?: number;
  zeroThreshold?: number;
}

export interface SummaryDataPointValueAtQuantile {
  quantile?: number;
  value?: number;
}

export interface SummaryDataPoint {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  quantileValues?: SummaryDataPointValueAtQuantile[];
  flags?: number;
}

export interface Gauge {
  dataPoints?: NumberDataPoint[];
}

export interface Sum {
  dataPoints?: NumberDataPoint[];
  aggregationTemporality?: AggregationTemporality | number;
  isMonotonic?: boolean;
}

export interface Histogram {
  dataPoints?: HistogramDataPoint[];
  aggregationTemporality?: AggregationTemporality | number;
}

export interface ExponentialHistogram {
  dataPoints?: ExponentialHistogramDataPoint[];
  aggregationTemporality?: AggregationTemporality | number;
}

export interface Summary {
  dataPoints?: SummaryDataPoint[];
}

export interface Metric {
  name?: string;
  description?: string;
  unit?: string;
  gauge?: Gauge;
  sum?: Sum;
  histogram?: Histogram;
  exponentialHistogram?: ExponentialHistogram;
  summary?: Summary;
  metadata?: KeyValue[];
}

export interface ScopeMetrics {
  scope?: InstrumentationScope;
  metrics?: Metric[];
  schemaUrl?: string;
}

export interface ResourceMetrics {
  resource?: Resource;
  scopeMetrics?: ScopeMetrics[];
  schemaUrl?: string;
}

export interface ExportMetricsServiceRequest {
  resourceMetrics?: ResourceMetrics[];
}

export interface ExportMetricsPartialSuccess {
  rejectedDataPoints?: string | number;
  errorMessage?: string;
}

export interface ExportMetricsServiceResponse {
  partialSuccess?: ExportMetricsPartialSuccess;
}

export interface MetricRecordContext {
  resource?: Resource;
  scope?: InstrumentationScope;
  schemaUrl?: string;
  scopeSchemaUrl?: string;
}
