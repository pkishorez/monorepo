import { Effect } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { moveToHome, table, task } from './tasks.ts';

const board = (boardId: string) =>
  task
    .query('primary', { pk: { boardId }, '>=': null }, { excludeDeleted: true })
    .pipe(Effect.map((page) => page.items.map((item) => item.value)));

export const transactions = lab({
  table,
  actions: [
    {
      label: 'Add t1 to work',
      run: () =>
        task.insert({ boardId: 'work', taskId: 't1', title: 'Plan the week' }),
    },
    {
      label: 'Add t1 to home',
      run: () =>
        task.insert({ boardId: 'home', taskId: 't1', title: 'Cook dinner' }),
    },
    { label: 'Move t1 to home', run: () => moveToHome('t1') },
  ],
  read: {
    label: 'both boards, deleted tasks hidden',
    effect: Effect.all([board('home'), board('work')]).pipe(
      Effect.map(([home, work]) => [...home, ...work]),
    ),
  },
});
