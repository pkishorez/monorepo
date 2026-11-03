import { Effect } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { table, task } from './board.ts';

const TITLES = [
  'Plan the week',
  'Water the plants',
  'Call home',
  'Fix the bike',
];

export const memoryLab = lab({
  table,
  actions: [
    {
      label: 'Insert a task',
      run: (n) =>
        task.insert({
          boardId: 'work',
          taskId: `t${n + 1}`,
          title: TITLES[n % TITLES.length]!,
        }),
    },
    {
      label: 'Rename t1',
      run: (n) =>
        task.getAndUpdate(
          { boardId: 'work', taskId: 't1' },
          { title: `Plan the week (take ${n + 2})` },
        ),
    },
    {
      label: 'Delete t1',
      run: () => task.delete({ boardId: 'work', taskId: 't1' }),
    },
  ],
  read: {
    label: 'by a query that excludes deleted tasks',
    effect: task
      .query(
        'primary',
        { pk: { boardId: 'work' }, '>=': null },
        { excludeDeleted: true },
      )
      .pipe(Effect.map((page) => page.items.map((item) => item.value))),
  },
});
