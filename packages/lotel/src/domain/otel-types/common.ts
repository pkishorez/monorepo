export interface AnyValue {
  stringValue?: string;
  boolValue?: boolean;
  intValue?: string | number;
  doubleValue?: number;
  arrayValue?: ArrayValue;
  kvlistValue?: KeyValueList;
  bytesValue?: string;
}

export interface ArrayValue {
  values?: AnyValue[];
}

export interface KeyValueList {
  values?: KeyValue[];
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
  entityRefs?: string[];
}

export interface Exemplars {
  filteredAttributes?: KeyValue[];
  timeUnixNano?: string | number;
  asDouble?: number;
  asInt?: string | number;
  spanId?: string;
  traceId?: string;
}
