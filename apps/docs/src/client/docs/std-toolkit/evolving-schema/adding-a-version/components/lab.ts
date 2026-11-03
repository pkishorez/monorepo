import { lab } from '../../../live-table/index.ts';
import { board, release1, release2, table } from './tasks.ts';

const TITLES = [
  'Plan the week',
  'Water the plants',
  'Call home',
  'Fix the bike',
];
const titleOf = (n: number) => TITLES[n % TITLES.length]!;

export const addingAVersion = lab({
  table,
  actions: [
    {
      label: 'Save a task with release 1',
      run: (n) =>
        release1.insert({
          boardId: 'work',
          taskId: `old-${n + 1}`,
          title: titleOf(n),
        }),
    },
    {
      label: 'Save a task with release 2',
      run: (n) =>
        release2.insert({
          boardId: 'work',
          taskId: `new-${n + 1}`,
          title: titleOf(n + 2),
          priority: 'high',
        }),
    },
  ],
  read: { label: 'as release 2 reads them', effect: board },
});
