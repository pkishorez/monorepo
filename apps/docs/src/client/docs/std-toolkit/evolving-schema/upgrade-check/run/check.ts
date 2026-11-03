import { Console, Effect } from 'effect';
import { findUpgradeFailures } from '@kestack/std-toolkit/eschema/testing';
import { Fixed, Forgetful } from '../components/tasks.ts';

export const program = Effect.gen(function* () {
  // Rows v1 could have stored, generated and read at the latest version.
  const forgetful = yield* findUpgradeFailures([{ schema: Forgetful }]);
  yield* Console.log(
    'forgetful migration:',
    forgetful.length,
    'failing version',
  );
  for (const report of forgetful) yield* Console.log(report);

  const fixed = yield* findUpgradeFailures([{ schema: Fixed }]);
  yield* Console.log('fixed migration:', fixed.length, 'failing versions');
  return fixed;
});
