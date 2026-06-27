import { describe, it, expect } from 'vitest';
import {
  exprUpdate,
  compileUpdateExpr,
  opAdd,
  opIfNotExists,
} from '../update.js';

type TestEntity = {
  name: string;
  count: number;
  tags: string[];
  user: { name: string };
};

describe('exprUpdate builder', () => {
  it('single set operation', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.set('name', 'test')]);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: 'update_set_value',
      key: 'name',
      value: 'test',
    });
  });

  it('multiple set operations', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('name', 'test'),
      $.set('count', 5),
    ]);
    expect(ops).toHaveLength(2);
  });

  it('set with opAdd (numeric increment)', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('count', $.opAdd('count', 1)),
    ]);
    expect(ops[0]).toMatchObject({
      type: 'update_set_value',
      key: 'count',
      value: { type: 'update_primitive_add_op', key: 'count', value: 1 },
    });
  });

  it('set with opIfNotExists', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('count', $.opIfNotExists('count', 0)),
    ]);
    expect(ops[0]).toMatchObject({
      type: 'update_set_value',
      key: 'count',
      value: { type: 'update_if_not_exists_op', key: 'count', value: 0 },
    });
  });

  it('append operation', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.append('tags', ['new-tag'])]);
    expect(ops[0]).toMatchObject({
      type: 'update_set_append',
      key: 'tags',
      value: ['new-tag'],
    });
  });

  it('prepend operation', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.prepend('tags', ['first'])]);
    expect(ops[0]).toMatchObject({
      type: 'update_set_prepend',
      key: 'tags',
      value: ['first'],
    });
  });

  it('mixed operations (set + append + prepend)', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('name', 'test'),
      $.append('tags', ['a']),
      $.prepend('tags', ['b']),
    ]);
    expect(ops).toHaveLength(3);
    expect(ops[0]!).toMatchObject({ type: 'update_set_value' });
    expect(ops[1]!).toMatchObject({ type: 'update_set_append' });
    expect(ops[2]!).toMatchObject({ type: 'update_set_prepend' });
  });
});

describe('compileUpdateExpr', () => {
  it('compiles plain SET', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.set('name', 'test')]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.type).toBe('update_operation');
    expect(compiled.exprResult.expr).toBe('SET #u_attr_1 = :u_value_2');
    expect(compiled.exprResult.attrResult.ExpressionAttributeNames).toEqual({
      '#u_attr_1': 'name',
    });
    expect(
      compiled.exprResult.attrResult.ExpressionAttributeValues[':u_value_2'],
    ).toEqual({ S: 'test' });
  });

  it('compiles opAdd → attr = attr + :val', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('count', $.opAdd('count', 1)),
    ]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.exprResult.expr).toBe(
      'SET #u_attr_1 = #u_attr_2 + :u_value_3',
    );
    expect(compiled.exprResult.attrResult.ExpressionAttributeNames).toEqual({
      '#u_attr_1': 'count',
      '#u_attr_2': 'count',
    });
  });

  it('compiles opIfNotExists → if_not_exists(attr, :val)', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('count', $.opIfNotExists('count', 0)),
    ]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.exprResult.expr).toBe(
      'SET #u_attr_1 = if_not_exists(#u_attr_2, :u_value_3)',
    );
  });

  it('compiles append → list_append(attr, :val)', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.append('tags', ['new'])]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.exprResult.expr).toBe(
      'SET #u_attr_1 = list_append(#u_attr_1, :u_value_2)',
    );
  });

  it('compiles prepend → list_append(:val, attr)', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.prepend('tags', ['first'])]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.exprResult.expr).toBe(
      'SET #u_attr_1 = list_append(:u_value_2, #u_attr_1)',
    );
  });

  it('multiple operations → comma-separated SET clauses', () => {
    const ops = exprUpdate<TestEntity>(($) => [
      $.set('name', 'test'),
      $.set('count', 5),
    ]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.exprResult.expr).toBe(
      'SET #u_attr_1 = :u_value_2, #u_attr_3 = :u_value_4',
    );
  });

  it('nested path keys', () => {
    const ops = exprUpdate<TestEntity>(($) => [$.set('user.name', 'John')]);
    const compiled = compileUpdateExpr(ops);

    expect(compiled.exprResult.expr).toBe(
      'SET #u_attr_1.#u_attr_2 = :u_value_3',
    );
    expect(compiled.exprResult.attrResult.ExpressionAttributeNames).toEqual({
      '#u_attr_1': 'user',
      '#u_attr_2': 'name',
    });
  });
});

describe('standalone helpers', () => {
  it('opAdd() returns correct structure', () => {
    const result = opAdd<TestEntity>('count', 5);
    expect(result).toEqual({
      type: 'update_primitive_add_op',
      key: 'count',
      value: 5,
    });
  });

  it('opIfNotExists() returns correct structure', () => {
    const result = opIfNotExists<TestEntity, 'count'>('count', 0);
    expect(result).toEqual({
      type: 'update_if_not_exists_op',
      key: 'count',
      value: 0,
    });
  });
});
