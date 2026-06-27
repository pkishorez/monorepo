import { describe, it, expect } from 'vitest';
import {
  exprCondition,
  exprFilter,
  compileConditionExpr,
} from '../condition.js';

type TestEntity = {
  age: number;
  status: string;
  name: string;
  score: number;
  user: { name: string; address: { city: string } };
};

describe('exprCondition builder', () => {
  it('creates cond with = operator', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.cond('status', '=', 'active'),
    );
    expect(op.type).toBe('condition_condition');
    if (op.type === 'condition_condition') {
      expect(op.key).toBe('status');
      expect(op.op).toBe('=');
      expect(op.value).toBe('active');
    }
  });

  it('creates cond with <> operator', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.cond('status', '<>', 'deleted'),
    );
    if (op.type === 'condition_condition') {
      expect(op.op).toBe('<>');
    }
  });

  it('creates cond with < operator', () => {
    const op = exprCondition<TestEntity>(($) => $.cond('age', '<', 18));
    if (op.type === 'condition_condition') {
      expect(op.op).toBe('<');
      expect(op.value).toBe(18);
    }
  });

  it('creates cond with <= operator', () => {
    const op = exprCondition<TestEntity>(($) => $.cond('age', '<=', 65));
    if (op.type === 'condition_condition') {
      expect(op.op).toBe('<=');
    }
  });

  it('creates cond with > operator', () => {
    const op = exprCondition<TestEntity>(($) => $.cond('age', '>', 18));
    if (op.type === 'condition_condition') {
      expect(op.op).toBe('>');
    }
  });

  it('creates cond with >= operator', () => {
    const op = exprCondition<TestEntity>(($) => $.cond('score', '>=', 90));
    if (op.type === 'condition_condition') {
      expect(op.op).toBe('>=');
    }
  });

  it('and() with multiple conditions', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.and($.cond('age', '>', 18), $.cond('status', '=', 'active')),
    );
    expect(op.type).toBe('condition_and');
    if (op.type === 'condition_and') {
      expect(op.conditions).toHaveLength(2);
    }
  });

  it('or() with multiple conditions', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.or($.cond('status', '=', 'active'), $.cond('status', '=', 'pending')),
    );
    expect(op.type).toBe('condition_or');
    if (op.type === 'condition_or') {
      expect(op.conditions).toHaveLength(2);
    }
  });

  it('nested and(or(...), cond(...))', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.and(
        $.or($.cond('status', '=', 'active'), $.cond('status', '=', 'pending')),
        $.cond('age', '>', 18),
      ),
    );
    expect(op.type).toBe('condition_and');
    if (op.type === 'condition_and') {
      expect(op.conditions).toHaveLength(2);
      expect(op.conditions[0]!.type).toBe('condition_or');
      expect(op.conditions[1]!.type).toBe('condition_condition');
    }
  });

  it('attributeNotExists()', () => {
    const op = exprCondition<TestEntity>(($) => $.attributeNotExists('name'));
    expect(op.type).toBe('condition_attribute_not_exists');
    if (op.type === 'condition_attribute_not_exists') {
      expect(op.key).toBe('name');
    }
  });

  it('attributeExists()', () => {
    const op = exprCondition<TestEntity>(($) => $.attributeExists('name'));
    expect(op.type).toBe('condition_attribute_exists');
    if (op.type === 'condition_attribute_exists') {
      expect(op.key).toBe('name');
    }
  });

  it('ref() creates FieldRef', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.cond('age', '<', $.ref('score')),
    );
    if (op.type === 'condition_condition') {
      expect(op.value).toEqual({ type: 'field_ref', key: 'score' });
    }
  });
});

describe('compileConditionExpr', () => {
  it('compiles simple cond to expression string', () => {
    const op = exprCondition<TestEntity>(($) => $.cond('age', '>', 18));
    const compiled = compileConditionExpr(op);

    expect(compiled.type).toBe('condition_operation');
    expect(compiled.expr.expr).toBe('#cf_attr_1 > :cf_value_2');
    expect(compiled.expr.attrResult.ExpressionAttributeNames).toEqual({
      '#cf_attr_1': 'age',
    });
    expect(
      compiled.expr.attrResult.ExpressionAttributeValues[':cf_value_2'],
    ).toEqual({
      N: '18',
    });
  });

  it("compiles AND with ' AND ' joiner", () => {
    const op = exprCondition<TestEntity>(($) =>
      $.and($.cond('age', '>', 18), $.cond('status', '=', 'active')),
    );
    const compiled = compileConditionExpr(op);
    expect(compiled.expr.expr).toBe(
      '#cf_attr_1 > :cf_value_2 AND #cf_attr_3 = :cf_value_4',
    );
  });

  it("compiles OR with ' OR ' joiner", () => {
    const op = exprCondition<TestEntity>(($) =>
      $.or($.cond('status', '=', 'active'), $.cond('status', '=', 'pending')),
    );
    const compiled = compileConditionExpr(op);
    expect(compiled.expr.expr).toBe(
      '#cf_attr_1 = :cf_value_2 OR #cf_attr_3 = :cf_value_4',
    );
  });

  it('compiles attribute_not_exists', () => {
    const op = exprCondition<TestEntity>(($) => $.attributeNotExists('name'));
    const compiled = compileConditionExpr(op);
    expect(compiled.expr.expr).toBe('attribute_not_exists(#cf_attr_1)');
    expect(compiled.expr.attrResult.ExpressionAttributeNames).toEqual({
      '#cf_attr_1': 'name',
    });
  });

  it('compiles attribute_exists', () => {
    const op = exprCondition<TestEntity>(($) => $.attributeExists('name'));
    const compiled = compileConditionExpr(op);
    expect(compiled.expr.expr).toBe('attribute_exists(#cf_attr_1)');
  });

  it('field ref uses attr placeholder (no value placeholder)', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.cond('age', '<', $.ref('score')),
    );
    const compiled = compileConditionExpr(op);
    expect(compiled.expr.expr).toBe('#cf_attr_1 < #cf_attr_2');
    expect(compiled.expr.attrResult.ExpressionAttributeNames).toEqual({
      '#cf_attr_1': 'age',
      '#cf_attr_2': 'score',
    });
    expect(
      Object.keys(compiled.expr.attrResult.ExpressionAttributeValues),
    ).toHaveLength(0);
  });

  it('nested path in condition key', () => {
    const op = exprCondition<TestEntity>(($) =>
      $.cond('user.name', '=', 'John'),
    );
    const compiled = compileConditionExpr(op);
    expect(compiled.expr.expr).toBe('#cf_attr_1.#cf_attr_2 = :cf_value_3');
    expect(compiled.expr.attrResult.ExpressionAttributeNames).toEqual({
      '#cf_attr_1': 'user',
      '#cf_attr_2': 'name',
    });
  });
});

describe('exprFilter', () => {
  it('returns same result as exprCondition', () => {
    const cond = exprCondition<TestEntity>(($) => $.cond('age', '>', 18));
    const filter = exprFilter<TestEntity>(($) => $.cond('age', '>', 18));

    expect(cond.type).toBe(filter.type);
    if (
      cond.type === 'condition_condition' &&
      filter.type === 'condition_condition'
    ) {
      expect(cond.key).toBe(filter.key);
      expect(cond.op).toBe(filter.op);
      expect(cond.value).toBe(filter.value);
    }
  });
});
