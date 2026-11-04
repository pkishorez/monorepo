import { Console, Effect } from 'effect';
import { findUpgradeFailures } from '@kestack/std-toolkit/schema/testing';
import { Fixed, Forgetful } from '../components/tasks.ts';

export const program = Effect.gen(function* () {
  // Generate rows v1 could have stored, and read each at the latest version.
  const forgetful = yield* findUpgradeFailures([{ schema: Forgetful }]);
  yield* Console.log('the forgetful migration:', forgetful);

  // The same check on the fix: no reports means every row reads.
  const fixed = yield* findUpgradeFailures([{ schema: Fixed }]);
  yield* Console.log('the fixed migration:', fixed);

  return `${forgetful.length} failing version before the fix, ${fixed.length} after`;
});
