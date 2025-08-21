import type { DynamoDB, QueryInput, ScanInput } from 'dynamodb-client';
import type { KeyConditionExpr } from './expr/index.js';
import type {
  IndexDefinition,
  KeyConditionExprParameters,
  KeyConditionExprSK,
} from './types.js';
import { keyCondition } from './expr/index.js';
import { marshall } from './utils.js';

export class DynamoQueryExecutor {
  constructor(
    private client: DynamoDB,
    private tableName: string,
  ) {}

  executeQuery<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
    options?: Partial<QueryInput> & { IndexName?: string },
  ) {
    const keyExpressions = this.buildKeyExpressions(key, index, options);

    // Build the query input with proper marshalling
    const queryInput: any = {
      TableName: this.tableName,
      KeyConditionExpression: keyExpressions.KeyConditionExpression,
      ...options,
      // Merge expression attribute names (key expressions override options if conflicts)
      ExpressionAttributeNames: keyExpressions.ExpressionAttributeNames,
    };

    // Handle ExclusiveStartKey marshalling
    if (options?.ExclusiveStartKey) {
      queryInput.ExclusiveStartKey = marshall(options.ExclusiveStartKey);
    }

    // Handle ExpressionAttributeValues marshalling
    if (keyExpressions.ExpressionAttributeValues) {
      queryInput.ExpressionAttributeValues = marshall(
        keyExpressions.ExpressionAttributeValues,
      );
    } else if (options?.ExpressionAttributeValues) {
      queryInput.ExpressionAttributeValues = marshall(
        options.ExpressionAttributeValues,
      );
    }

    return this.client.query(queryInput);
  }

  executeScan(options?: Partial<ScanInput> & { IndexName?: string }) {
    // Build the scan input with proper marshalling
    const scanInput: any = {
      TableName: this.tableName,
      ...options,
    };

    // Handle ExclusiveStartKey marshalling
    if (options?.ExclusiveStartKey) {
      scanInput.ExclusiveStartKey = marshall(options.ExclusiveStartKey);
    }

    // Handle ExpressionAttributeValues marshalling
    if (options?.ExpressionAttributeValues) {
      scanInput.ExpressionAttributeValues = marshall(
        options.ExpressionAttributeValues,
      );
    }

    return this.client.scan(scanInput);
  }

  private buildKeyExpressions<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
    options?: Partial<QueryInput>,
  ) {
    // Convert from old format to new unified format
    const unifiedKey = this.convertKeyConditionFormat(key, index);

    // Generate key condition expression using our unified function
    const keyExprResult = keyCondition(index, unifiedKey);

    // Merge with any existing expression attributes/values from options
    const expressionAttributeNames: Record<string, string> = {
      ...(options?.ExpressionAttributeNames || {}),
      ...keyExprResult.exprAttributes,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ...(options?.ExpressionAttributeValues || {}),
      ...keyExprResult.exprValues,
    };

    const result: any = {
      KeyConditionExpression: keyExprResult.condition,
      ExpressionAttributeNames: expressionAttributeNames,
    };

    // Only include ExpressionAttributeValues if there are actual values
    if (Object.keys(expressionAttributeValues).length > 0) {
      result.ExpressionAttributeValues = expressionAttributeValues;
    }

    return result;
  }

  private convertKeyConditionFormat<TIndex extends IndexDefinition>(
    key: KeyConditionExprParameters<TIndex>,
    index: TIndex,
  ): import('./expr/index.js').KeyConditionExprParameters<TIndex> {
    const result: any = { pk: key.pk };

    // Handle sort key if present
    if ('sk' in key && key.sk !== undefined && 'sk' in index) {
      if (typeof key.sk === 'string') {
        result.sk = key.sk;
      } else {
        // Convert from old object format to new standardized format
        const oldSk = key.sk as KeyConditionExprSK;
        result.sk = this.convertSortKeyCondition(oldSk);
      }
    }

    return result;
  }

  private convertSortKeyCondition(
    condition: KeyConditionExprSK,
  ): KeyConditionExpr<string> {
    if ('beginsWith' in condition) {
      return { type: 'beginsWith', value: condition.beginsWith };
    } else if ('<' in condition) {
      return { type: '<', value: condition['<'] };
    } else if ('<=' in condition) {
      return { type: '<=', value: condition['<='] };
    } else if ('>' in condition) {
      return { type: '>', value: condition['>'] };
    } else if ('>=' in condition) {
      return { type: '>=', value: condition['>='] };
    } else if ('=' in condition) {
      return { type: '=', value: condition['='] };
    } else if ('between' in condition) {
      return { type: 'between', value: condition.between };
    } else {
      throw new Error('Unknown sort key condition format');
    }
  }
}
