import { Effect, Stream } from 'effect';
import { lab } from '../../../live-table/index.ts';
import { board, settings, table, task } from './app.ts';

const BOARDS = ['work', 'home', 'garden'];
const TITLES = [
  'Plan the week',
  'Water the plants',
  'Call home',
  'Fix the bike',
];

export const singleTableDesign = lab({
  table,
  actions: [
    {
      label: 'Add a board',
      run: (n) => {
        const boardId = BOARDS[n % BOARDS.length]!;
        return board.insert({ boardId, name: `The ${boardId} board` });
      },
    },
    {
      label: 'Add a task to work',
      run: (n) =>
        task.insert({
          boardId: 'work',
          taskId: `t${n + 1}`,
          title: TITLES[n % TITLES.length]!,
        }),
    },
    {
      label: 'Save settings',
      run: (n) => settings.put({ theme: n % 2 === 0 ? 'dark' : 'light' }),
    },
  ],
  read: {
    label: 'where each row sits',
    effect: Stream.runCollect(table.scan()).pipe(
      Effect.map((items) =>
        [...items].map((item) => ({ pk: item.pk, sk: item.sk })),
      ),
    ),
  },
});
