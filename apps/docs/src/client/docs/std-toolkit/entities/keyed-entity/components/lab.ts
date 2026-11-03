import { Effect } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { table, task } from '../../board/board.ts';

const TITLES = ['Plan the week', 'Water the plants', 'Call home'];

// The task the other buttons work on: the first one, t1.
const t1 = { boardId: 'work', taskId: 't1' };

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
          priority: 'low',
          done: false,
        }),
    },
    { label: 'Finish t1', run: () => task.getAndUpdate(t1, { done: true }) },
    { label: 'Delete t1', run: () => task.delete(t1) },
    { label: 'Restore t1', run: () => task.restore(t1) },
  ],
  read: {
    label: 'the work board, deleted tasks hidden',
    effect: task
      .query(
        'primary',
        { pk: { boardId: 'work' }, '>=': null },
        { excludeDeleted: true },
      )
      .pipe(Effect.map((page) => page.items.map((item) => item.value))),
  },
});
