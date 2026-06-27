import { describe, it, expect } from 'vitest';
import { buildExpr } from '../build-expr.js';
import { exprCondition } from '../condition.js';
import { exprUpdate } from '../update.js';
import { keyConditionExpr } from '../key-condition.js';
import type { IndexDefinition } from '../../types/index.js';

type TestEntity = { name: string; age: number; status: string };

const index: IndexDefinition = { pk: 'PK', sk: 'SK' };

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
      const filter = exprCondition<TestEntity>(($) => $.cond('age', '>', 18));
      const result = buildExpr({ keyCondition, filter });

      const names = result.ExpressionAttributeNames!;
      expect(Object.values(names)).toContain('PK');
      expect(Object.values(names)).toContain('age');
    });
  });

  describe('update mode (update + optional condition)', () => {
    it('update only → has UpdateExpression, no ConditionExpression', () => {
      const update = exprUpdate<TestEntity>(($) => [$.set('name', 'test')]);
      const result = buildExpr({ update });

      expect(result.UpdateExpression).toBeDefined();
      expect(result.UpdateExpression).toContain('SET');
      expect(result).not.toHaveProperty('ConditionExpression');
    });

    it('update + condition → has both expressions', () => {
      const update = exprUpdate<TestEntity>(($) => [$.set('name', 'test')]);
      const condition = exprCondition<TestEntity>(($) =>
        $.attributeExists('name'),
      );
      const result = buildExpr({ update, condition });

      expect(result.UpdateExpression).toBeDefined();
      expect(result.ConditionExpression).toBeDefined();
      expect(result.ConditionExpression).toContain('attribute_exists');
    });

    it('attribute maps merged from update + condition', () => {
      const update = exprUpdate<TestEntity>(($) => [$.set('name', 'test')]);
      const condition = exprCondition<TestEntity>(($) =>
        $.cond('age', '>', 18),
      );
      const result = buildExpr({ update, condition });

      const names = result.ExpressionAttributeNames!;
      expect(Object.values(names)).toContain('name');
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
