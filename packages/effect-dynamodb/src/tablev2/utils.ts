import type { AttributeValue } from 'dynamodb-client';
import {
  marshall as marshall_,
  unmarshall as unmarshall_,
} from '@aws-sdk/util-dynamodb';

export type MarshalledOutput = Record<string, AttributeValue>;
export function marshall(value: unknown): MarshalledOutput {
  return marshall_(value);
}

export function unmarshall(value: MarshalledOutput): Record<string, unknown> {
  return unmarshall_(value as any);
}
