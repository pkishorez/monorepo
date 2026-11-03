import { lab } from '../../../live-table/index.ts';
import { workBoard } from './board.ts';
import { table, task } from './table.ts';

const TITLES = [
  'Plan the week',
  'Water the plants',
  'Call home',
  'Fix the bike',
];
const t1 = { boardId: 'work', taskId: 't1' };

export const quickStart = lab({
  table,
  actions: [
    {
      label: 'Add a task',
      run: (n) =>
        task.insert({
          boardId: 'work',
          taskId: `t${n + 1}`,
          title: TITLES[n % TITLES.length]!,
          status: 'open',
        }),
    },
    {
      label: 'Finish t1',
      run: () => task.getAndUpdate(t1, { status: 'done' }),
    },
    { label: 'Delete t1', run: () => task.delete(t1) },
  ],
  read: { label: "the 'work' board, by query", effect: workBoard },
});
