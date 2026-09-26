import { it, describe, expect } from 'vitest';
import { buildExpr, exprFilter } from '../expression.js';
import { exprCondition } from '../condition.js';
import { keyConditionExpr } from '../key-condition.js';
import type { IndexDefinition } from '../types.js';

type TestEntity = { name: string; age: number; status: string };

const index: IndexDefinition = { pk: 'PK', sk: 'SK' };

describe('DynamoDB', () => {
  describe('Expressions', () => {
    describe('buildExpr', () => {
      describe('query mode (keyCondition + optional filter)', () => {
        it('keyCondition only → has KeyConditionExpression, no FilterExpression', () => {
          const keyCondition = keyConditionExpr(index, {
            pk: 'USER#123',
            sk: 'PROFILE',
          });
          const result = buildExpr({ keyCondition });

          expect(result.KeyConditionExpression).toBeDefined();
          expect(result).not.toHaveProperty('FilterExpression');
          expect(result.ExpressionAttributeNames).toBeDefined();
          expect(result.ExpressionAttributeValues).toBeDefined();
        });

        it('keyCondition + filter → has both expressions', () => {
          const keyCondition = keyConditionExpr(index, { pk: 'USER#123' });
          const filter = exprCondition<TestEntity>(($) =>
            $.cond('status', '=', 'active'),
          );
          const result = buildExpr({ keyCondition, filter });

          expect(result.KeyConditionExpression).toBeDefined();
          expect(result.FilterExpression).toBeDefined();
        });

        it('attribute maps merged from both sub-expressions', () => {
          const keyCondition = keyConditionExpr(index, { pk: 'USER#123' });
          const filter = exprCondition<TestEntity>(($) =>
            $.cond('age', '>', 18),
          );
          const result = buildExpr({ keyCondition, filter });

          const names = result.ExpressionAttributeNames!;
          expect(Object.values(names)).toContain('PK');
          expect(Object.values(names)).toContain('age');
        });
      });

      describe('condition mode (condition only)', () => {
        it('condition → has ConditionExpression', () => {
          const condition = exprCondition<TestEntity>(($) =>
            $.cond('status', '=', 'active'),
          );
          const result = buildExpr({ condition });

          expect(result.ConditionExpression).toBeDefined();
          expect(result.ConditionExpression).toContain('=');
        });
      });

      describe('filter mode (filter only)', () => {
        it('filter → has FilterExpression', () => {
          const filter = exprFilter<TestEntity>(($) =>
            $.cond('status', '=', 'active'),
          );
          const result = buildExpr({ filter });

          expect(result.FilterExpression).toBeDefined();
          expect(result).not.toHaveProperty('KeyConditionExpression');
          expect(result.ExpressionAttributeNames).toBeDefined();
          expect(result.ExpressionAttributeValues).toBeDefined();
        });
      });

      describe('attribute map pruning', () => {
        it('empty attr names/values omitted from result', () => {
          const condition = exprCondition<TestEntity>(($) =>
            $.cond('age', '<', $.ref('status')),
          );
          const result = buildExpr({ condition });

          expect(result.ExpressionAttributeNames).toBeDefined();
          expect(result).not.toHaveProperty('ExpressionAttributeValues');
        });
      });
    });
  });
});
