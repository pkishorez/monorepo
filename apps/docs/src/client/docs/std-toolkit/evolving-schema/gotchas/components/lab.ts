import { lab } from '../../../live-table/index.ts';
import { newRelease, oldBoard, oldRelease, table } from './tasks.ts';

export const gotchas = lab({
  table,
  actions: [
    {
      label: 'Save a task with the old release',
      run: (n) =>
        oldRelease.insert({
          boardId: 'work',
          taskId: `old-${n + 1}`,
          title: 'Plan the week',
        }),
    },
    {
      label: 'Save a task with the new release',
      run: (n) =>
        newRelease.insert({
          boardId: 'work',
          taskId: `new-${n + 1}`,
          title: 'Call home',
          priority: 'high',
        }),
    },
  ],
  read: { label: 'as the old release reads them', effect: oldBoard },
});
