import { Effect } from 'effect';
import { task } from './table.ts';

// The open list: every task on the 'work' board that isn't deleted.
export const workBoard = task
  .query(
    'primary',
    { pk: { boardId: 'work' }, '>=': null },
    { excludeDeleted: true },
  )
  .pipe(Effect.map((page) => page.items.map((item) => item.value)));
