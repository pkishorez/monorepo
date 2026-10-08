import { play } from '@kstackz/web-platform/feedback';
import { GestureProvider, GestureZone } from '@kstackz/web-platform/input';
import {
  type Choice,
  ThumbPicker,
} from '@kstackz/web-platform/recipes/thumb-picker';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

function Places() {
  const [place, setPlace] = useState('Today');
  const [heard, setHeard] = useState<ReadonlyArray<string>>([]);
  const tell = (what: string) => setHeard((all) => [...all, what]);
  const go = (to: string) => () => {
    play('success');
    tell('success ♪');
    setPlace(to);
  };
  const tree: ReadonlyArray<Choice> = [
    { id: 'today', label: 'Today', onSelect: go('Today') },
    {
      id: 'accounts',
      label: 'Accounts',
      children: [
        { id: 'cash', label: 'Cash', onSelect: go('Accounts › Cash') },
        { id: 'bank', label: 'Bank', onSelect: go('Accounts › Bank') },
        { id: 'card', label: 'Card', onSelect: go('Accounts › Card') },
      ],
    },
    { id: 'reports', label: 'Reports', onSelect: go('Reports') },
    { id: 'settings', label: 'Settings', onSelect: go('Settings') },
  ];
  return (
    <>
      <ThumbPicker
        tree={tree}
        start={['today']}
        // As Ledger does: a tick for each, and a buzz for each move.
        onFeedback={(feedback) => {
          if (feedback === 'wrong') return tell('wrong');
          play('tick');
          if (feedback !== 'lock') navigator.vibrate?.(4);
          tell(feedback === 'lock' ? 'lock ♪' : `${feedback} ♪ buzz`);
        }}
      />
      <section className="mt-6 rounded-2xl border p-4">
        <p className="text-sm text-muted-foreground">You are in</p>
        <p data-testid="place" className="text-3xl font-semibold">
          {place}
        </p>
      </section>
      <section className="mt-4 rounded-2xl bg-muted/60 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sound and touch
        </p>
        <p data-testid="heard" className="mt-1 font-mono text-sm">
          {heard.length === 0 ? '—' : heard.join(' · ')}
        </p>
      </section>
      <div className="pointer-events-none fixed bottom-24 left-6 flex size-20 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/40 text-xs text-muted-foreground">
        thumb
      </div>
    </>
  );
}

export default Proof.browser({
  title: 'A move that leads nowhere shakes the menu once, and the walk goes on',
  description:
    'Pushing left at the top list leads nowhere: the Tree Walk tells a Wrong Way once and the menu shakes; it counts on from where the finger turned, so two Steps down reach Reports.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh bg-background p-4 text-foreground">
            <h1 className="text-xl font-semibold">Ledger</h1>
            <p className="text-sm text-muted-foreground">
              Rest your left thumb, then swipe with another finger.
            </p>
            <Places />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The screen shows', '[data-testid=place]');
      const place = yield* tab.text('[data-testid=place]');
      yield* Proof.assert('you start in Today', place === 'Today');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const way = (
        corners: ReadonlyArray<{ x: number; y: number; t: number }>,
      ) =>
        corners.flatMap((to, index) => {
          const from = corners[index - 1];
          if (from === undefined) return [to];
          const steps = Math.max(1, Math.round((to.t - from.t) / 16));
          return Array.from({ length: steps }, (_, step) => {
            const t = (step + 1) / steps;
            const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
            return {
              x: from.x + (to.x - from.x) * eased,
              y: from.y + (to.y - from.y) * eased,
              t: from.t + (to.t - from.t) * t,
            };
          });
        });
      // Left, where there is nothing to go back to, then down two Steps.
      const finger = way([
        { x: 300, y: 380, t: 300 },
        { x: 300, y: 380, t: 450 },
        { x: 250, y: 380, t: 900 },
        { x: 250, y: 380, t: 1100 },
        { x: 250, y: 450, t: 1700 },
        { x: 250, y: 450, t: 2200 },
      ]);
      const thumb = [
        { x: 86, y: 676, t: 0 },
        { x: 86, y: 676, t: 2600 },
      ];
      yield* tab.gesture(
        'Push left, then swipe down to Reports',
        Gesture.fingers([thumb, finger]),
      );
      return {
        place: yield* tab.text('[data-testid=place]'),
        heard: yield* tab.text('[data-testid=heard]'),
      };
    }),
  verify: ({ place, heard }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the push left was wrong once, then two Steps followed (${heard})`,
        heard.startsWith('lock ♪ · wrong · step ♪ buzz · step ♪ buzz'),
      );
      yield* Proof.assert('lifting went to Reports', place === 'Reports');
    }),
});
