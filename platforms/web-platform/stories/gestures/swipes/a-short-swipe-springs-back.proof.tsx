import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/web-platform/components/motion';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// Letting go past 140px, or flicking at 900px/s, archives the mail.
const COMMIT = { distance: 140, velocity: 900 };
const SPRING = { type: 'spring', duration: 0.35, bounce: 0.2 } as const;

function Mail() {
  const x = useMotionValue(0);
  const [result, setResult] = useState('Waiting for a swipe');
  const [armed, setArmed] = useState(false);
  const [archived, setArchived] = useState(false);
  const progress = useTransform(x, [0, COMMIT.distance], [0, 1]);

  const swipe = useSwipe({
    direction: 'right',
    commit: COMMIT,
    enabled: !archived,
    onCommit: (release) => {
      setResult(`Archived at ${Math.round(release.offset)}px`);
      setArchived(true);
      void animate(x, 420, { duration: 0.2, ease: [0.4, 0, 1, 1] });
    },
    onCancel: (reason, release) => {
      setResult(
        `Sprang back: ${reason}${release === undefined ? '' : ` at ${Math.round(release.offset)}px`}`,
      );
      void animate(x, 0, SPRING);
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) => x.set(offset));
  useMotionValueEvent(swipe.willCommit, 'change', setArmed);

  return (
    <>
      <div className="relative mt-6 overflow-hidden rounded-2xl">
        <motion.div
          style={{ opacity: progress }}
          className={`absolute inset-0 flex items-center pl-5 font-medium text-white transition-colors ${armed ? 'bg-emerald-600' : 'bg-emerald-400'}`}
        >
          Archive
        </motion.div>
        <motion.div
          data-testid="mail"
          style={{ x }}
          className="relative border bg-card p-4"
        >
          <p className="font-medium">Your order shipped</p>
          <p className="text-sm text-muted-foreground">
            It arrives on Thursday.
          </p>
        </motion.div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        State: <span data-testid="state">{swipe.state}</span>
      </p>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Swipe
        </p>
        <p data-testid="result" className="text-2xl font-semibold">
          {result}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'A short swipe springs back, and a long one archives',
  description:
    'useSwipe judges the release against its CommitRule: a slow 70px drag Cancels as `short` and the mail springs home; a 220px swipe Commits.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="h-dvh bg-background p-4 text-foreground">
            <h1 className="text-xl font-semibold">Inbox</h1>
            <p className="text-sm text-muted-foreground">
              Swipe right to archive.
            </p>
            <Mail />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The mail shows', '[data-testid=mail]');
      const state = yield* tab.text('[data-testid=state]');
      yield* Proof.assert('the swipe is idle', state === 'idle');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Drag the mail a little, slowly',
        Gesture.swipe('[data-testid=mail]', 'right', {
          distance: 70,
          duration: '900 millis',
        }),
      );
      const short = yield* tab.text('[data-testid=result]');
      // The spring home settles.
      yield* Effect.sleep('500 millis');
      const restingAt = yield* tab.evaluate(
        () =>
          new DOMMatrix(
            getComputedStyle(document.querySelector('[data-testid=mail]')!)
              .transform,
          ).m41,
      );
      yield* tab.gesture(
        'Swipe the mail all the way',
        Gesture.swipe('[data-testid=mail]', 'right', {
          distance: 220,
          duration: '400 millis',
        }),
      );
      return {
        short,
        restingAt,
        long: yield* tab.text('[data-testid=result]'),
      };
    }),
  verify: ({ short, restingAt, long }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `the short swipe cancelled as short (${short})`,
        short.startsWith('Sprang back: short'),
      );
      yield* Proof.assert('the mail sprang back home', Math.abs(restingAt) < 1);
      yield* Proof.assert(
        `the long swipe archived it (${long})`,
        long.startsWith('Archived'),
      );
    }),
});
