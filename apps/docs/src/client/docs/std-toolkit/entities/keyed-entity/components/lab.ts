import { Effect } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { table, task } from './tasks.ts';

const TITLES = ['Plan the week', 'Water the plants', 'Call home'];

// The task each button works on: the first one, t1.
const first = { boardId: 'work', taskId: 't1' };

export const keyedEntity = lab({
  table,
  actions: [
    {
      label: 'Insert a task',
      run: (n) =>
        task.insert({
          boardId: 'work',
          taskId: `t${n + 1}`,
          title: TITLES[n % TITLES.length]!,
          status: 'open',
        }),
    },
    {
      label: 'Mark t1 done',
      run: () => task.getAndUpdate(first, { status: 'done' }),
    },
    { label: 'Delete t1', run: () => task.delete(first) },
    { label: 'Restore t1', run: () => task.restore(first) },
  ],
  read: {
    label: 'the board, deleted tasks hidden',
    effect: task
      .query(
        'primary',
        { pk: { boardId: 'work' }, '>=': null },
        { excludeDeleted: true },
      )
      .pipe(Effect.map((page) => page.items.map((item) => item.value))),
  },
});
