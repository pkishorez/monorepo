import type {
  AttributeConditionExpr as AttributeCondition,
  ConditionExprParameters,
  KeyConditionExprParameters,
} from '../src/table/expr/index.js';
import { describe, expect } from 'vitest';
import { attrExpr, expr, keyCondition } from '../src/table/expr/index.js';

// Mock index definitions for testing
const simpleIndex = { pk: 'id' } as const;
const compoundIndex = { pk: 'pk', sk: 'sk' } as const;

describe('expression System', () => {
  describe('individual Expression Types', () => {
    it('comparison expressions', () => {
      const operators = [
        { type: '<' as const, symbol: '<' },
        { type: '<=' as const, symbol: '<=' },
        { type: '>' as const, symbol: '>' },
        { type: '>=' as const, symbol: '>=' },
        { type: '=' as const, symbol: '=' },
      ];

      operators.forEach(({ type, symbol }) => {
        const condition: AttributeCondition<number> = {
          attr: 'test_attr',
          condition: { type, value: 42 },
        };

        const result = expr(condition);

        expect(result.expr).toMatch(
          new RegExp(
            `^#attr\\d+ ${symbol.replace(/[<>=]/g, '\\$&')} :value\\d+$`,
          ),
        );
        expect(Object.values(result.exprAttributes)).toContain('test_attr');
        expect(Object.values(result.exprValues)).toContain(42);
      });
    });

    it('string expressions', () => {
      const stringOps = [
        { type: 'beginsWith' as const, func: 'begins_with' },
        { type: 'contains' as const, func: 'contains' },
      ];

      stringOps.forEach(({ type, func }) => {
        const condition: AttributeCondition<string> = {
          attr: 'text_field',
          condition: { type, value: 'test' },
        };

        const result = expr(condition);

        expect(result.expr).toMatch(
          new RegExp(`^${func}\\(#attr\\d+, :value\\d+\\)$`),
        );
        expect(Object.values(result.exprAttributes)).toContain('text_field');
        expect(Object.values(result.exprValues)).toContain('test');
      });
    });

    it('range expression', () => {
      const condition: AttributeCondition<number> = {
        attr: 'range_field',
        condition: { type: 'between', value: [10, 20] },
      };

      const result = expr(condition);

      expect(result.expr).toMatch(
        /^#attr\d+ BETWEEN :value\d+ AND :value\d+_end$/,
      );
      expect(Object.values(result.exprAttributes)).toContain('range_field');
      expect(Object.values(result.exprValues)).toContain(10);
      expect(Object.values(result.exprValues)).toContain(20);
    });

    it('existence expressions', () => {
      const existsCondition: AttributeCondition<any> = {
        attr: 'maybe_field',
        condition: { type: 'exists', value: true },
      };

      const notExistsCondition: AttributeCondition<any> = {
        attr: 'maybe_field',
        condition: { type: 'exists', value: false },
      };

      const existsResult = expr(existsCondition);
      const notExistsResult = expr(notExistsCondition);

      expect(existsResult.expr).toMatch(/^attribute_exists\(#attr\d+\)$/);
      expect(notExistsResult.expr).toMatch(
        /^attribute_not_exists\(#attr\d+\)$/,
      );
      expect(Object.values(existsResult.exprAttributes)).toContain(
        'maybe_field',
      );
      expect(Object.values(notExistsResult.exprAttributes)).toContain(
        'maybe_field',
      );
    });

    it('attribute type expression', () => {
      const condition: AttributeCondition<any> = {
        attr: 'typed_field',
        condition: { type: 'attrType', value: 'S' },
      };

      const result = expr(condition);

      expect(result.expr).toMatch(/^attribute_type\(#attr\d+, :value\d+\)$/);
      expect(Object.values(result.exprAttributes)).toContain('typed_field');
      expect(Object.values(result.exprValues)).toContain('S');
    });

    it('size expression', () => {
      const condition: AttributeCondition<any> = {
        attr: 'list_field',
        condition: {
          type: 'size',
          value: { type: '>', value: 5 },
        },
      };

      const result = expr(condition);

      expect(result.expr).toContain('size(#attr');
      expect(result.expr).toContain('>');
      expect(Object.values(result.exprAttributes)).toContain('list_field');
      expect(Object.values(result.exprValues)).toContain(5);
    });
  });

  describe('compound Expressions', () => {
    it('aND expression', () => {
      const condition: ConditionExprParameters<any> = {
        type: 'and',
        value: [
          {
            attr: 'field1',
            condition: { type: '=', value: 'value1' },
          },
          {
            attr: 'field2',
            condition: { type: '>', value: 10 },
          },
        ],
      };

      const result = expr(condition);

      expect(result.expr).toMatch(/^\(.+ AND .+\)$/);
      expect(result.expr).toContain('=');
      expect(result.expr).toContain('>');
      expect(Object.values(result.exprAttributes)).toContain('field1');
      expect(Object.values(result.exprAttributes)).toContain('field2');
      expect(Object.values(result.exprValues)).toContain('value1');
      expect(Object.values(result.exprValues)).toContain(10);
    });

    it('oR expression', () => {
      const condition: ConditionExprParameters<any> = {
        type: 'or',
        value: [
          {
            attr: 'status',
            condition: { type: '=', value: 'active' },
          },
          {
            attr: 'priority',
            condition: { type: '=', value: 'high' },
          },
        ],
      };

      const result = expr(condition);

      expect(result.expr).toMatch(/^\(.+ OR .+\)$/);
      expect(Object.values(result.exprAttributes)).toContain('status');
      expect(Object.values(result.exprAttributes)).toContain('priority');
      expect(Object.values(result.exprValues)).toContain('active');
      expect(Object.values(result.exprValues)).toContain('high');
    });

    it('nested expressions', () => {
      const condition: ConditionExprParameters<any> = {
        type: 'and',
        value: [
          {
            attr: 'base_condition',
            condition: { type: '=', value: true },
          },
          {
            type: 'or',
            value: [
              {
                attr: 'option1',
                condition: { type: '=', value: 'A' },
              },
              {
                attr: 'option2',
                condition: { type: '=', value: 'B' },
              },
            ],
          },
        ],
      };

      const result = expr(condition);

      expect(result.expr).toMatch(/^\(.+ AND \(.+ OR .+\)\)$/);
      expect(Object.values(result.exprAttributes)).toContain('base_condition');
      expect(Object.values(result.exprAttributes)).toContain('option1');
      expect(Object.values(result.exprAttributes)).toContain('option2');
      expect(Object.values(result.exprValues)).toContain(true);
      expect(Object.values(result.exprValues)).toContain('A');
      expect(Object.values(result.exprValues)).toContain('B');
    });
  });

  describe('key Condition Function', () => {
    it('simple partition key condition', () => {
      const params: KeyConditionExprParameters<typeof simpleIndex> = {
        pk: 'user123',
      };

      const result = keyCondition(simpleIndex, params);

      expect(result.expr).toMatch(/^#attr\d+ = :value\d+$/);
      expect(Object.values(result.exprAttributes)).toContain('id');
      expect(Object.values(result.exprValues)).toContain('user123');
    });

    it('compound key with string sort key', () => {
      const params: KeyConditionExprParameters<typeof compoundIndex> = {
        pk: 'user123',
        sk: 'profile',
      };

      const result = keyCondition(compoundIndex, params);

      expect(result.expr).toMatch(/^\(.+ AND .+\)$/);
      expect(Object.values(result.exprAttributes)).toContain('pk');
      expect(Object.values(result.exprAttributes)).toContain('sk');
      expect(Object.values(result.exprValues)).toContain('user123');
      expect(Object.values(result.exprValues)).toContain('profile');
    });

    it('compound key with expression sort key', () => {
      const params: KeyConditionExprParameters<typeof compoundIndex> = {
        pk: 'user123',
        sk: { type: 'beginsWith', value: 'post#' },
      };

      const result = keyCondition(compoundIndex, params);

      expect(result.expr).toMatch(/^\(.+ AND begins_with\(.+\)\)$/);
      expect(Object.values(result.exprAttributes)).toContain('pk');
      expect(Object.values(result.exprAttributes)).toContain('sk');
      expect(Object.values(result.exprValues)).toContain('user123');
      expect(Object.values(result.exprValues)).toContain('post#');
    });

    it('all sort key operators', () => {
      const operators = ['<', '<=', '>', '>=', '='] as const;

      operators.forEach((op) => {
        const params: KeyConditionExprParameters<typeof compoundIndex> = {
          pk: 'test',
          sk: { type: op, value: 'value' },
        };

        const result = keyCondition(compoundIndex, params);

        expect(result.expr).toMatch(/^\(.+ AND .+\)$/);
        expect(Object.values(result.exprValues)).toContain('test');
        expect(Object.values(result.exprValues)).toContain('value');
      });
    });

    it('between sort key condition', () => {
      const params: KeyConditionExprParameters<typeof compoundIndex> = {
        pk: 'user123',
        sk: { type: 'between', value: ['2023-01-01', '2023-12-31'] },
      };

      const result = keyCondition(compoundIndex, params);

      expect(result.expr).toMatch(/^\(.+ AND .+ BETWEEN .+ AND .+\)$/);
      expect(Object.values(result.exprValues)).toContain('user123');
      expect(Object.values(result.exprValues)).toContain('2023-01-01');
      expect(Object.values(result.exprValues)).toContain('2023-12-31');
    });
  });

  describe('edge Cases', () => {
    it('special characters in attribute names', () => {
      const condition: AttributeCondition<string> = {
        attr: 'user.email@domain-test_field',
        condition: { type: '=', value: 'test' },
      };

      const result = expr(condition);

      expect(Object.values(result.exprAttributes)).toContain(
        'user.email@domain-test_field',
      );
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
        const condition: AttributeCondition<any> = {
          attr: 'test_field',
          condition: { type: '=', value },
        };

        const result = expr(condition);

        expect(Object.values(result.exprValues)).toContain(value);
      });
    });

    it('attribute name and value uniqueness', () => {
      // Create multiple expressions to ensure unique naming
      const conditions = Array.from({ length: 5 }, (_, i) => ({
        attr: `field${i}`,
        condition: { type: '=' as const, value: `value${i}` },
      }));

      const results = conditions.map((condition) => expr(condition));

      // Check that all attribute names are unique
      const allAttrNames = results.flatMap((r) =>
        Object.keys(r.exprAttributes),
      );
      expect(new Set(allAttrNames).size).toBe(allAttrNames.length);

      // Check that all value names are unique
      const allValueNames = results.flatMap((r) => Object.keys(r.exprValues));
      expect(new Set(allValueNames).size).toBe(allValueNames.length);
    });
  });

  describe('direct attrExpr Function', () => {
    it('attrExpr creates proper attribute mappings', () => {
      const result = attrExpr({ type: '=', value: 'test' }, 'my_attribute');

      expect(result.expr).toMatch(/^#attr\d+ = :value\d+$/);
      expect(Object.values(result.exprAttributes)).toContain('my_attribute');
      expect(Object.values(result.exprValues)).toContain('test');
    });
  });
});
