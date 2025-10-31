import { updateExpr, UpdateOperation } from './update.js';
import { buildExpr } from './expr.js';
import { conditionExpr, ConditionOperation } from './condition.js';

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

interface User {
  id: string;
  name: string;
  age: number;
  status: 'active' | 'inactive' | 'pending';
  tags: string[];
  arr: { name: string }[];
  a: {
    b: {
      c: string;
    };
  };
}

// Style 1: Callback approach - Types flow from the explicit type parameter
const test1: UpdateOperation<User> = updateExpr(($) => [
  $.set('age', 30), // ✓ Set a value
  $.set('age', $.addOp('age', 12)), // ✓ Arithmetic: age = age + 12
  $.append('tags', ['new-tag']), // ✓ Append to list
  $.prepend('arr', [{ name: 'first' }]), // ✓ Prepend to list
  $.set('name', $.ifNotExistsOp('name', 'Anonymous')), // ✓ Set default if not exists
  $.set('age', $.ifNotExistsOp('age', 18)), // ✓ Set default age if not exists
]);

// Style 2: Dynamic usage with 'any' - Relaxed type constraints
const test2: UpdateOperation = updateExpr(($) => [
  $.set('age', 'hello'), // ✓ Works with any type
  $.append('dynamicList', ['item']), // ✓ Any field accepted
  $.set('username', $.ifNotExistsOp('username', 'guest')), // ✓ Set default username
]);

// ============================================================================
// Condition Expression Examples
// ============================================================================

// Example 1: Simple comparison conditions
const cond1: ConditionOperation = conditionExpr<User>(
  ($) => $.cond('age', '>', 18), // ✓ Simple comparison
);

const cond2: ConditionOperation = conditionExpr<User>(
  ($) => $.cond('status', '=', 'active'), // ✓ String equality check
);

// Example 2: All comparison operators
const cond3: ConditionOperation = conditionExpr<User>(($) =>
  $.and(
    $.cond('age', '=', 25), // ✓ Equal
    $.cond('age', '<>', 30), // ✓ Not equal
    $.cond('age', '<', 50), // ✓ Less than
    $.cond('age', '<=', 49), // ✓ Less than or equal
    $.cond('age', '>', 18), // ✓ Greater than
    $.cond('age', '>=', 19), // ✓ Greater than or equal
  ),
);

// Example 3: AND combination - multiple conditions must be true
const cond4: ConditionOperation = conditionExpr<User>(($) =>
  $.and(
    $.cond('age', '>=', 21), // ✓ Must be 21 or older
    $.cond('status', '=', 'active'), // ✓ Must be active
  ),
);

// Example 4: OR combination - at least one condition must be true
const cond5: ConditionOperation = conditionExpr<User>(($) =>
  $.or(
    $.cond('status', '=', 'active'), // ✓ Active status OR
    $.cond('status', '=', 'pending'), // ✓ Pending status
  ),
);

// Example 5: Nested conditions - OR within AND
const cond6: ConditionOperation = conditionExpr<User>(($) =>
  $.and(
    $.cond('age', '>=', 21), // ✓ Must be 21 or older AND
    $.or(
      $.cond('status', '=', 'active'), // ✓ (Active OR
      $.cond('status', '=', 'pending'), // ✓ Pending)
    ),
  ),
);

// Example 6: Complex nested conditions - multiple levels
const cond7: ConditionOperation = conditionExpr<User>(($) =>
  $.and(
    $.cond('age', '>=', 18), // ✓ Age between 18 and 65
    $.cond('age', '<=', 65),
    $.or(
      $.cond('status', '=', 'active'), // ✓ Active OR
      $.and(
        $.cond('status', '=', 'pending'), // ✓ (Pending AND age >= 21)
        $.cond('age', '>=', 21),
      ),
    ),
  ),
);

// Example 7: Nested path comparison
const cond8: ConditionOperation = conditionExpr<User>(
  ($) => $.cond('a.b.c', '=', 'some-value'), // ✓ Nested attribute comparison
);

// Example 8: Dynamic usage with 'any' - Relaxed type constraints
const cond9: ConditionOperation = conditionExpr<any>(($) =>
  $.and(
    $.cond('customField', '>', 100), // ✓ Works with any field
    $.cond('anotherField', '=', 'value'), // ✓ No type constraints
  ),
);

console.log('\n=== UPDATE EXPRESSIONS ===\n');
log(test1);
log(test2);

console.log('\n=== CONDITION EXPRESSIONS ===\n');
log(cond1);
log(cond2);
log(cond3);
log(cond4);
log(cond5);
log(cond6);
log(cond7);
log(cond8);
log(cond9);

interface User {
  id: string;
  name: string;
  age: number;
  status: 'active' | 'inactive' | 'pending';
  email?: string;
}

// Example 1: Update with condition
const expr1 = buildExpr({
  update: updateExpr<User>(($) => [
    $.set('age', 30),
    $.set('name', 'John Doe'),
  ]),
  condition: conditionExpr<User>(($) => $.cond('status', '=', 'active')),
});

// Example 2: Update only (no condition)
const expr2 = buildExpr({
  update: updateExpr<User>(($) => [$.set('age', $.addOp('age', 1))]),
});

// Example 3: Condition only (for conditional delete/get)
const expr3 = buildExpr({
  condition: conditionExpr<User>(($) =>
    $.and($.cond('age', '>=', 18), $.cond('status', '=', 'active')),
  ),
});

// Example 4: Complex update with complex condition
const expr4 = buildExpr({
  update: updateExpr<User>(($) => [
    $.set('age', 25),
    $.set('status', 'active'),
    $.set('email', $.ifNotExistsOp('email', 'default@example.com')),
  ]),
  condition: conditionExpr<User>(($) =>
    $.and(
      $.cond('age', '<', 65),
      $.or($.cond('status', '=', 'pending'), $.cond('status', '=', 'inactive')),
    ),
  ),
});

console.log('\n=== Example 1: Update with Condition ===\n');
log(expr1);

console.log('\n=== Example 2: Update Only ===\n');
log(expr2);

console.log('\n=== Example 3: Condition Only ===\n');
log(expr3);

console.log('\n=== Example 4: Complex Update with Complex Condition ===\n');
log(expr4);
