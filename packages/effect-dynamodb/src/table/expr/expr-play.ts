import { updateExpr, compileUpdateExpr } from './update.js';
import { conditionExpr } from './condition.js';
import { keyConditionExpr } from './key-condition.js';
import { buildExpr } from './expr.js';
import type { IndexDefinition } from '../types.js';

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

interface User {
  id: string;
  name: string;
  age: number;
  status: 'active' | 'inactive' | 'pending';
  email?: string;
}

// Mock index definitions for testing
const primaryIndex: IndexDefinition = {
  pk: 'pk',
  sk: 'sk',
};

const gsiIndex: IndexDefinition = {
  pk: 'gsi1pk',
  sk: 'gsi1sk',
};

// Example 1: Update with condition
const expr1 = buildExpr({
  update: compileUpdateExpr(
    updateExpr<User>(($) => [$.set('age', 30), $.set('name', 'John Doe')]),
  ),
  condition: conditionExpr<User>(($) => $.cond('status', '=', 'active')),
});

// Example 2: Update only (no condition)
const expr2 = buildExpr({
  update: compileUpdateExpr(
    updateExpr<User>(($) => [$.set('age', $.addOp('age', 1))]),
  ),
});

// Example 3: Condition only (for conditional delete/get)
const expr3 = buildExpr({
  condition: conditionExpr<User>(($) =>
    $.and($.cond('age', '>=', 18), $.cond('status', '=', 'active')),
  ),
});

// Example 4: Complex update with complex condition
const expr4 = buildExpr({
  update: compileUpdateExpr(
    updateExpr<User>(($) => [
      $.set('age', 25),
      $.set('status', 'active'),
      $.set('email', $.ifNotExistsOp('email', 'default@example.com')),
    ]),
  ),
  condition: conditionExpr<User>(($) =>
    $.and(
      $.cond('age', '<', 65),
      $.or($.cond('status', '=', 'pending'), $.cond('status', '=', 'inactive')),
    ),
  ),
});

// Example 5: Key condition only (for query)
const expr5 = buildExpr({
  keyCondition: keyConditionExpr(primaryIndex, {
    pk: 'user#123',
    sk: 'profile#',
  }),
});

// Example 6: Key condition with beginsWith
const expr6 = buildExpr({
  keyCondition: keyConditionExpr(primaryIndex, {
    pk: 'user#123',
    sk: { beginsWith: 'order#' },
  }),
});

// Example 7: Key condition with between
const expr7 = buildExpr({
  keyCondition: keyConditionExpr(primaryIndex, {
    pk: 'user#123',
    sk: { between: ['2024-01-01', '2024-12-31'] },
  }),
});

// Example 8: Key condition with comparison operators
const expr8 = buildExpr({
  keyCondition: keyConditionExpr(primaryIndex, {
    pk: 'user#123',
    sk: { '>': '2024-06-01' },
  }),
});

// Example 9: Query with key condition and filter condition
const expr9 = buildExpr({
  keyCondition: keyConditionExpr(gsiIndex, {
    pk: 'status#active',
    sk: { '>=': '2024-01-01' },
  }),
  condition: conditionExpr<User>(($) => $.cond('age', '>=', 18)),
});

// Example 10: All three expressions together (uncommon but possible)
const expr10 = buildExpr({
  update: compileUpdateExpr(
    updateExpr<User>(($) => [$.set('status', 'active')]),
  ),
  keyCondition: keyConditionExpr(primaryIndex, {
    pk: 'user#123',
    sk: 'profile#',
  }),
  condition: conditionExpr<User>(($) => $.cond('age', '>=', 18)),
});

console.log('\n=== Example 1: Update with Condition ===\n');
log(expr1);

console.log('\n=== Example 2: Update Only ===\n');
log(expr2);

console.log('\n=== Example 3: Condition Only ===\n');
log(expr3);

console.log('\n=== Example 4: Complex Update with Complex Condition ===\n');
log(expr4);

console.log('\n=== Example 5: Key Condition Only (Simple) ===\n');
log(expr5);

console.log('\n=== Example 6: Key Condition with beginsWith ===\n');
log(expr6);

console.log('\n=== Example 7: Key Condition with between ===\n');
log(expr7);

console.log('\n=== Example 8: Key Condition with Comparison ===\n');
log(expr8);

console.log('\n=== Example 9: Key Condition + Filter Condition ===\n');
log(expr9);

console.log('\n=== Example 10: All Three Expressions ===\n');
log(expr10);
