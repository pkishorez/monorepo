import { lab } from '../../../live-table/index.ts';
import { board, release1, release2, table } from './tasks.ts';

export const shapesInsideShapes = lab({
  table,
  actions: [
    {
      label: "Save a 'todo' with release 1",
      run: (n) =>
        release1.insert({
          boardId: 'work',
          taskId: `old-${n + 1}`,
          title: 'Plan the week',
          status: 'todo',
          checklist: [{ text: 'Look at the calendar', checked: false }],
        }),
    },
    {
      label: "Save an 'open' with release 2",
      run: (n) =>
        release2.insert({
          boardId: 'work',
          taskId: `new-${n + 1}`,
          title: 'Call home',
          status: 'open',
          checklist: [],
        }),
    },
  ],
  read: { label: 'as release 2 reads them', effect: board },
});
