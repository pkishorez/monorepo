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
          status: 'open',
        }),
    },
    {
      label: 'Save with this release',
      run: (n) =>
        task.insert({
          boardId: 'work',
          taskId: `new-${n + 1}`,
          title: TITLES[(n + 2) % TITLES.length]!,
          status: 'open',
        }),
    },
    { label: 'Reindex', run: () => reindexAll },
  ],
  read: {
    label: "what byStatus finds for 'open'",
    effect: task
      .query('byStatus', { pk: { status: 'open' }, '>=': null })
      .pipe(Effect.map((page) => page.items.map((item) => item.value))),
  },
});
