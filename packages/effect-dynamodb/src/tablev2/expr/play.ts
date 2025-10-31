import { updateExpr, UpdateOperation } from './update.js';

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

interface User {
  id: string;
  name: string;
  age: number;
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
]);

// Style 2: Dynamic usage with 'any' - Relaxed type constraints
const test2: UpdateOperation = updateExpr(($) => [
  $.set('age', 'hello'), // ✓ Works with any type
  $.append('dynamicList', ['item']), // ✓ Any field accepted
]);

log(test1);
log(test2);
