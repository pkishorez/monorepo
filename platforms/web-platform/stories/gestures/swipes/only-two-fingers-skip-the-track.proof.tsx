import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const TRACKS = ['Morning Light', 'Night Drive', 'Low Tide'];

function Player() {
  const [at, setAt] = useState(0);
  const [heard, setHeard] = useState('Nothing yet');
  useSwipe({
    direction: 'left',
    fingers: 2,
    onCommit: () => {
      setAt((index) => (index + 1) % TRACKS.length);
      setHeard('Two fingers: next track');
    },
    onCancel: (reason) => setHeard(`Not a skip: ${reason}`),
  });
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div
          data-testid="cover"
          className="size-56 rounded-3xl bg-[linear-gradient(145deg,#0f172a,#334155_45%,#f59e0b)] shadow-xl"
        />
        <div className="text-center">
          <p data-testid="track" className="text-2xl font-semibold">
            {TRACKS[at]}
          </p>
          <p className="text-sm text-muted-foreground">
            Track {at + 1} of {TRACKS.length}
          </p>
        </div>
      </div>
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Last swipe
        </p>
        <p data-testid="heard" className="text-2xl font-semibold">
          {heard}
        </p>
      </footer>
    </>
  );
}

export default Proof.browser({
  title: 'Only a two-finger swipe skips the track',
  description:
    'useSwipe with `fingers: 2`: a one-finger swipe left Cancels with `fingers` and nothing changes; two fingers swiping left Commit.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <GestureZone className="flex h-dvh flex-col bg-background p-6 text-foreground">
            <h1 className="text-xl font-semibold">Now playing</h1>
            <p className="text-sm text-muted-foreground">
              Swipe left with two fingers to skip.
            </p>
            <Player />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The player shows', '[data-testid=cover]');
      const track = yield* tab.text('[data-testid=track]');
      yield* Proof.assert('the first track plays', track === TRACKS[0]);
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Swipe left with one finger',
        Gesture.swipe('[data-testid=cover]', 'left'),
      );
      const oneFinger = {
        heard: yield* tab.text('[data-testid=heard]'),
        track: yield* tab.text('[data-testid=track]'),
      };
      yield* tab.gesture(
        'Swipe left with two fingers',
        Gesture.swipe('[data-testid=cover]', 'left', { fingers: 2 }),
      );
      return {
        oneFinger,
        twoFingers: {
          heard: yield* tab.text('[data-testid=heard]'),
          track: yield* tab.text('[data-testid=track]'),
        },
      };
    }),
  verify: ({ oneFinger, twoFingers }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'one finger did not skip',
        oneFinger.track === TRACKS[0] &&
          oneFinger.heard === 'Not a skip: fingers',
      );
      yield* Proof.assert(
        'two fingers skipped to the next track',
        twoFingers.track === TRACKS[1] &&
          twoFingers.heard === 'Two fingers: next track',
      );
    }),
});
