import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/web-platform/components/motion';
import { play } from '@kstackz/web-platform/feedback';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// How far, in px, the knob travels to pay.
const TRACK = 270;

function SlideToPay() {
  const x = useMotionValue(0);
  const fill = useTransform(x, [0, TRACK], ['0%', '100%']);
  const [armed, setArmed] = useState(false);
  const [paid, setPaid] = useState(false);
  const [heard, setHeard] = useState<ReadonlyArray<string>>([]);
  const tell = (what: string) => setHeard((all) => [...all, what]);

  const swipe = useSwipe({
    direction: 'right',
    enabled: !paid,
    // Only all the way: a flick does not pay.
    commit: { distance: TRACK },
    onCommit: () => {
      play('confirm');
      tell('confirm ♪');
      setPaid(true);
    },
    onCancel: () => {
      void animate(x, 0, { type: 'spring', duration: 0.3, bounce: 0.2 });
    },
  });
  useMotionValueEvent(swipe.offset, 'change', (offset) =>
    x.set(Math.min(offset, TRACK)),
  );
  // Arming is the moment to tell the hand: a click and a short buzz.
  useMotionValueEvent(swipe.willCommit, 'change', (will) => {
    setArmed(will);
    if (!will) return;
    play('arm');
    navigator.vibrate?.(8);
    tell('arm ♪ buzz 8ms');
  });

  return (
    <>
      <section className="mt-8 rounded-3xl border p-5">
        <p className="text-sm text-muted-foreground">Pay Asha</p>
        <p className="text-4xl font-semibold tabular-nums">₹500</p>
        <div
          data-testid="track"
          className="relative mt-6 h-16 overflow-hidden rounded-full bg-muted"
        >
          <motion.div
            style={{ width: fill }}
            className={`absolute inset-y-0 left-0 ${armed || paid ? 'bg-emerald-500' : 'bg-emerald-300'}`}
          />
          <p
            className={`absolute inset-0 flex items-center justify-center text-sm font-medium ${armed || paid ? 'text-white' : 'text-muted-foreground'}`}
          >
            {paid ? 'Paid' : 'Slide to pay →'}
          </p>
          <motion.div
            data-testid="knob"
            style={{ x }}
            className="absolute top-1 left-1 flex size-14 items-center justify-center rounded-full bg-background text-xl shadow-md"
          >
            ₹
          </motion.div>
        </div>
      </section>
      <section className="mt-4 rounded-2xl bg-muted/60 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sound and touch
        </p>
        <p data-testid="heard" className="mt-1 font-mono text-sm">
          {heard.length === 0 ? '—' : heard.join(' · ')}
        </p>
      </section>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Payment
        </p>
        <p data-testid="paid" className="text-2xl font-semibold">
          {paid ? 'Paid ₹500' : 'Not paid'}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title:
    'Sliding to pay clicks and buzzes as it arms, and confirms when you let go',
  description:
    'useSwipe’s willCommit flips as the knob reaches the end: the app plays web-platform’s `arm` sound and asks for an 8ms buzz, then `confirm` as it Commits. Headless Chromium plays no audio, so the screen shows each decision.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <main className="h-dvh bg-background p-4 text-foreground">
            <h1 className="text-xl font-semibold">Send money</h1>
            <GestureZone>
              <SlideToPay />
            </GestureZone>
          </main>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The slider shows', '[data-testid=knob]');
      const paid = yield* tab.text('[data-testid=paid]');
      yield* Proof.assert('nothing is paid', paid === 'Not paid');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      const knob = yield* tab.evaluate(() => {
        const box = document
          .querySelector('[data-testid=knob]')!
          .getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      });
      yield* tab.gesture(
        'Slide the knob to the end',
        Gesture.drag(
          '[data-testid=knob]',
          { x: knob.x + 290, y: knob.y },
          {
            duration: '1200 millis',
          },
        ),
      );
      return {
        paid: yield* tab.text('[data-testid=paid]'),
        heard: yield* tab.text('[data-testid=heard]'),
      };
    }),
  verify: ({ paid, heard }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `it clicked and buzzed as it armed, then confirmed (${heard})`,
        heard === 'arm ♪ buzz 8ms · confirm ♪',
      );
      yield* Proof.assert('the payment went through', paid === 'Paid ₹500');
    }),
});
