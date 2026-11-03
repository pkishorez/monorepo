import { lab } from '../../../live-table/index.ts';
import { board, release1, release2, table } from './tasks.ts';

const COLOURS = ['blue', 'green', 'amber'];

export const renameAndRemove = lab({
  table,
  actions: [
    {
      label: 'Save a task with release 1',
      run: (n) =>
        release1.insert({
          boardId: 'work',
          taskId: `old-${n + 1}`,
          title: 'Plan the week',
          colour: COLOURS[n % COLOURS.length]!,
          notes: 'Ask about Friday',
        }),
    },
    {
      label: 'Save a task with release 2',
      run: (n) =>
        release2.insert({
          boardId: 'work',
          taskId: `new-${n + 1}`,
          title: 'Call home',
          color: COLOURS[(n + 1) % COLOURS.length]!,
        }),
    },
    {
      label: 'Save old-1 again with release 2',
      run: () =>
        release2.getAndUpdate({ boardId: 'work', taskId: 'old-1' }, (task) => ({
          title: `${task.title}, again`,
        })),
    },
  ],
  read: { label: 'as release 2 reads them', effect: board },
});
