import { updateExpr, UpdateOperation } from './update.js';

function log(value: unknown) {
  console.dir(value, { depth: 10 });
}

interface User {
  id: string;
  name: string;
  age: number;
  a: {
    b: {
      c: string;
    };
  };
}

// Style 1: Callback approach - Types flow from the explicit type parameter
const test1: UpdateOperation<User> = updateExpr(($) => [
  $.set('age', 25), // ✓ 'age' is properly typed as keyof User
  $.setAdd('age', $.addOp('age', 100)), // ✓ Value must be number (matches User['age'])
]);

// Style 2: Builder approach - Create a typed builder first (kept for compatibility)
const test2: UpdateOperation = updateExpr(($) => [
  $.set('age', 'hello'),
  $.setAdd('age', 5),
]);

log(test1);
log(test2);
