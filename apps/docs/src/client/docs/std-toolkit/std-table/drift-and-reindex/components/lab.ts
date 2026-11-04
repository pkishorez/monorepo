import { Effect } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { oldTask, reindexAll, table, task } from './tasks.ts';

const TITLES = [
  'Plan the week',
  'Water the plants',
  'Call home',
  'Fix the bike',
];

export const driftAndReindex = lab({
  table,
  actions: [
    {
      label: 'Save with the last release',
      run: (n) =>
        oldTask.insert({
          boardId: 'work',
          taskId: `old-${n + 1}`,
          title: TITLES[n % TITLES.length]!,
          priority: 'high',
        }),
    },
    {
      label: 'Save with this release',
      run: (n) =>
        task.insert({
          boardId: 'work',
          taskId: `new-${n + 1}`,
          title: TITLES[(n + 2) % TITLES.length]!,
          priority: 'high',
        }),
    },
    { label: 'Reindex, as setup does', run: () => reindexAll },
  ],
  read: {
    label: "what byPriority finds for 'high'",
    effect: task
      .query('byPriority', { pk: { priority: 'high' }, '>=': null })
      .pipe(Effect.map((page) => page.items.map((item) => item.value))),
  },
});
