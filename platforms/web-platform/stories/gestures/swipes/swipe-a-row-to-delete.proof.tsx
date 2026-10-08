import { GestureProvider, GestureZone } from '@kstackz/web-platform/input';
import { SwipeRow } from '@kstackz/web-platform/recipes/swipe-row';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const SPENT = [
  { id: 'coffee', label: 'Coffee', amount: '₹180' },
  { id: 'groceries', label: 'Groceries', amount: '₹1,240' },
  { id: 'metro', label: 'Metro card', amount: '₹500' },
];

function Spending() {
  const [rows, setRows] = useState(SPENT);
  const [deleted, setDeleted] = useState('Nothing deleted');
  return (
    <>
      <ul className="flex flex-col gap-2 pt-6">
        {rows.map((row) => (
          <li key={row.id} data-testid={`row-${row.id}`}>
            <SwipeRow
              onDelete={() => {
                setRows((all) => all.filter((each) => each.id !== row.id));
                setDeleted(`Deleted ${row.label}`);
              }}
            >
              <div className="flex items-center justify-between rounded-lg border px-4 py-4">
                <span className="font-medium">{row.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {row.amount}
                </span>
              </div>
            </SwipeRow>
          </li>
        ))}
      </ul>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          {rows.length} entries
        </p>
        <p data-testid="deleted" className="text-2xl font-semibold">
          {deleted}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Swiping a row left deletes it',
  description:
    'web-platform’s SwipeRow recipe: each row is a Gesture Zone with a useSwipe left. Past 112px Delete arms; letting go slides the row away and deletes it.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh bg-background p-4 text-foreground">
            <h1 className="text-xl font-semibold">Spent today</h1>
            <p className="text-sm text-muted-foreground">
              Swipe an entry left to delete it.
            </p>
            <Spending />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The entries show', '[data-testid=row-coffee]');
      const rows = yield* tab.count('li');
      yield* Proof.assert('three entries show', rows === 3);
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Swipe Coffee left',
        Gesture.swipe('[data-testid=row-coffee]', 'left', {
          distance: 220,
          duration: '450 millis',
        }),
      );
      yield* tab.waitFor('Coffee is gone', 'text=Deleted Coffee');
      return {
        deleted: yield* tab.text('[data-testid=deleted]'),
        rows: yield* tab.count('li'),
        coffee: yield* tab.count('[data-testid=row-coffee]'),
      };
    }),
  verify: ({ deleted, rows, coffee }) =>
    Effect.gen(function* () {
      yield* Proof.assert('Coffee is no longer listed', coffee === 0);
      yield* Proof.assert('two entries are left', rows === 2);
      yield* Proof.assert(
        'it says what it deleted',
        deleted === 'Deleted Coffee',
      );
    }),
});
