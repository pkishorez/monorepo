import type { AttributeValue } from 'dynamodb-client';
import { marshall as marshall_, unmarshall as unmarshall_ } from '@aws-sdk/util-dynamodb';

export function marshall(value: unknown): Record<string, AttributeValue> {
  return marshall_(value);
}

export function unmarshall(value: Record<string, AttributeValue>): Record<string, unknown> {
  return unmarshall_(value as any);
}
