import type { PutCondition } from '../../std-table/contract/index.js';
import { quoteIdentifier } from './identifier.js';

export const conflictClause = (
  names: readonly string[],
  primary: { readonly pk: string; readonly sk: string },
  condition: PutCondition | undefined,
) => {
  if (condition?.kind === 'not-exists') return ' DO NOTHING';

  const assignments = names
    .filter((name) => name !== primary.pk && name !== primary.sk)
    .map(
      (name) => `${quoteIdentifier(name)} = excluded.${quoteIdentifier(name)}`,
    )
    .join(', ');
  return ` DO UPDATE SET ${assignments}`;
};
