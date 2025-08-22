import type { UpdateExprParameters } from '../src/table/expr/index.js';
import { describe, expect, it } from 'vitest';
import { updateExpr } from '../src/table/expr/index.js';

describe('update Expression System', () => {
  describe('individual Update Operations', () => {
    it('sET operation with function - list_append', () => {
      const newItems = ['newItem1', 'newItem2'];
      const parameters: UpdateExprParameters = {
        SET: {
          items: {
            op: 'list_append',
            attr: 'existingItems',
            list: newItems,
          },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(
        /^SET #attr\d+ = list_append\(#attr\d+, :value\d+\)$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('items');
      expect(Object.values(result.exprAttributes)).toContain('existingItems');

      // Check that the array is in the values (reference equality)
      const values = Object.values(result.exprValues);
      expect(values).toHaveLength(1);
      expect(values[0]).toBe(newItems);
    });

    it('sET operation with function - if_not_exists', () => {
      const parameters: UpdateExprParameters<{ counter: number }> = {
        SET: {
          counter: { op: 'if_not_exists', attr: 'counter', default: 0 },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(
        /^SET #attr\d+ = if_not_exists\(#attr\d+, :value\d+\)$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('counter');
      expect(Object.values(result.exprValues)).toContain(0);
    });

    it('sET operation with function - plus', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          total: { op: 'plus', attr: 'subtotal', value: 10 },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(
        /^SET #attr\d+ = #attr\d+ \+ :value\d+$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('total');
      expect(Object.values(result.exprAttributes)).toContain('subtotal');
      expect(Object.values(result.exprValues)).toContain(10);
    });

    it('sET operation with function - minus', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          remaining: { op: 'minus', attr: 'total', value: 5 },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(
        /^SET #attr\d+ = #attr\d+ - :value\d+$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('remaining');
      expect(Object.values(result.exprAttributes)).toContain('total');
      expect(Object.values(result.exprValues)).toContain(5);
    });
    it('sET operation', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          name: {
            op: 'assign',
            value: 'John Doe',
          },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(/^SET #attr\d+ = :value\d+$/);
      expect(Object.values(result.exprAttributes)).toContain('name');
      expect(Object.values(result.exprValues)).toContain('John Doe');
    });

    it('aDD operation', () => {
      const parameters: UpdateExprParameters = {
        ADD: {
          counter: 1,
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(/^ADD #attr\d+ :value\d+$/);
      expect(Object.values(result.exprAttributes)).toContain('counter');
      expect(Object.values(result.exprValues)).toContain(1);
    });

    it('rEMOVE operation', () => {
      const parameters: UpdateExprParameters<{ oldField: string }> = {
        REMOVE: ['oldField'],
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(/^REMOVE #attr\d+$/);
      expect(Object.values(result.exprAttributes)).toContain('oldField');
      expect(Object.keys(result.exprValues)).toHaveLength(0);
    });

    it('dELETE operation', () => {
      const tagSet = new Set(['tag1', 'tag2']);
      const parameters: UpdateExprParameters = {
        DELETE: {
          tags: tagSet,
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(/^DELETE #attr\d+ :value\d+$/);
      expect(Object.values(result.exprAttributes)).toContain('tags');

      // Check that the Set is in the values (reference equality)
      const values = Object.values(result.exprValues);
      expect(values).toHaveLength(1);
      expect(values[0]).toBe(tagSet);
    });
  });

  describe('multiple Update Operations', () => {
    it('multiple SET operations', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          name: { op: 'assign', value: 'Jane Doe' },
          email: { op: 'assign', value: 'jane@example.com' },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(
        /^SET #attr\d+ = :value\d+, #attr\d+ = :value\d+$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('name');
      expect(Object.values(result.exprAttributes)).toContain('email');
      expect(Object.values(result.exprValues)).toContain('Jane Doe');
      expect(Object.values(result.exprValues)).toContain('jane@example.com');
    });

    it('mixed operations (SET, ADD, REMOVE)', () => {
      const parameters: UpdateExprParameters = {
        SET: { name: { op: 'assign', value: 'Updated Name' } },
        ADD: { counter: 5 },
        REMOVE: ['deprecated'],
      };

      const result = updateExpr(parameters);

      // Should contain all three operation types
      expect(result.updateExpression).toContain('SET');
      expect(result.updateExpression).toContain('ADD');
      expect(result.updateExpression).toContain('REMOVE');

      expect(Object.values(result.exprAttributes)).toContain('name');
      expect(Object.values(result.exprAttributes)).toContain('counter');
      expect(Object.values(result.exprAttributes)).toContain('deprecated');

      expect(Object.values(result.exprValues)).toContain('Updated Name');
      expect(Object.values(result.exprValues)).toContain(5);
    });

    it('multiple operations of different types', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          field1: { op: 'assign', value: 'value1' },
          field2: { op: 'assign', value: 'value2' },
        },
        ADD: {
          counter1: 1,
          counter2: 2,
        },
      };

      const result = updateExpr(parameters);

      // Should group operations by type
      expect(result.updateExpression).toMatch(/SET.*ADD/);
      expect(result.updateExpression.match(/SET/g)).toHaveLength(1);
      expect(result.updateExpression.match(/ADD/g)).toHaveLength(1);

      // Should have commas between operations of same type
      expect(result.updateExpression).toContain(', ');
    });
  });

  describe('additional Operations', () => {
    it('all operation types together', () => {
      const parameters: UpdateExprParameters = {
        SET: { name: { op: 'assign', value: 'Updated Name' } },
        ADD: { counter: 1 },
        REMOVE: ['oldField'],
        DELETE: { tags: new Set(['tag1']) },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toContain('SET');
      expect(result.updateExpression).toContain('ADD');
      expect(result.updateExpression).toContain('REMOVE');
      expect(result.updateExpression).toContain('DELETE');
      expect(Object.values(result.exprAttributes)).toContain('name');
      expect(Object.values(result.exprAttributes)).toContain('counter');
      expect(Object.values(result.exprAttributes)).toContain('oldField');
      expect(Object.values(result.exprAttributes)).toContain('tags');
    });

    it('sET with functions', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          items: {
            op: 'list_append',
            attr: 'existingList',
            list: ['item1'],
          },
          counter: { op: 'if_not_exists', attr: 'counter', default: 0 },
        },
      };

      const result = updateExpr(parameters);

      expect(result.updateExpression).toMatch(
        /^SET .+ list_append\(.+\), .+ if_not_exists\(.+\)$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('items');
      expect(Object.values(result.exprAttributes)).toContain('counter');
      expect(Object.values(result.exprAttributes)).toContain('existingList');
    });
  });

  describe('edge Cases', () => {
    it('empty parameters should handle gracefully', () => {
      // @ts-expect-error "Empty params are not allowed."
      const parameters: UpdateExprParameters = {};

      const result = updateExpr(parameters);

      expect(result.updateExpression).toBe('');
      expect(Object.keys(result.exprAttributes)).toHaveLength(0);
      expect(Object.keys(result.exprValues)).toHaveLength(0);
    });

    it('special characters in attribute names', () => {
      const parameters: UpdateExprParameters = {
        SET: {
          'user.email@domain': { op: 'assign', value: 'test@example.com' },
        },
      };

      const result = updateExpr(parameters);

      expect(Object.values(result.exprAttributes)).toContain(
        'user.email@domain',
      );
      expect(Object.values(result.exprValues)).toContain('test@example.com');
    });

    it('various value types', () => {
      const testValues = [
        'string',
        42,
        3.14,
        true,
        false,
        null,
        [1, 2, 3],
        { nested: 'object' },
      ];

      testValues.forEach((value) => {
        const parameters: UpdateExprParameters = {
          SET: {
            testField: {
              op: 'assign',
              value,
            },
          },
        };

        const result = updateExpr(parameters);

        expect(Object.values(result.exprValues)).toContain(value);
      });
    });
  });
});
