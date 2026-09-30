import { KanbanIcon } from '@kstackz/ui-toolkit/lucide';
import { codeFiles, type Feature } from '../feature.ts';
import { BoardApp } from './app.tsx';

/** A task board: columns, cards and a sidebar all wanting the sideways swipe. */
export const board: Feature = {
  slug: 'board',
  title: 'Board',
  icon: KanbanIcon,
  tries: [
    'Swipe sideways on a column’s title or the space under its cards: the board pages one column.',
    'Swipe a card right: it flies to the next column and both counts change; left sends it back.',
    'Swipe a Done card right: it resists and settles back, as nothing comes after Done.',
    'Hold a card still, then drag it across columns and drop it: it lands where the gap opens.',
    'Carry a card to the screen’s right side and hold it there: the board pages under it.',
    'Swipe right from the very left edge, even over a card: the boards sidebar opens, the card stays.',
    'Pull down on the top of a column: only that column refreshes and a new card slides in.',
    'Scroll To do, then swipe a card sideways while it still glides: the scroll stops and the card moves.',
  ],
  App: BoardApp,
  files: codeFiles(
    'board',
    import.meta.glob('./*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ),
};
