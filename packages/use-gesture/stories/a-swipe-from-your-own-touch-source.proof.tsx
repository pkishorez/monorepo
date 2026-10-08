import {
  createGestureProvider,
  type Direction,
  directionOf,
  type PointerSample,
  SLOP,
  Swipe,
  wants,
  type ZoneTree,
} from '@kstackz/use-gesture';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

type Target = Element | null;

// The zones are any element marked `data-zone`; none is trapped.
const DOM: ZoneTree<Element, Target> = {
  zoneOf: (target) => target?.closest('[data-zone]') ?? null,
  parentOf: (zone) => zone.parentElement?.closest('[data-zone]') ?? null,
  trapped: () => false,
};

const WAYS = ['left', 'right'] as const;

type Verdict = {
  readonly direction: Direction | undefined;
  readonly offset: number;
  readonly velocity: number;
  readonly commits: boolean;
};

// The card, read straight from the platform-free core: the page's pointer
// events are the touch source, and the Swipe rules judge the release.
function Card() {
  const card = useRef<HTMLDivElement>(null);
  const [verdict, setVerdict] = useState<Verdict>();

  useEffect(() => {
    const zone = card.current;
    if (zone === null) return;
    const provider = createGestureProvider(DOM);
    let way: Direction | undefined;
    let offset = 0;
    let velocity = Swipe.createVelocity();

    const removeZone = provider.addZone(zone);
    const removeListener = provider.addGesture(zone, {
      enabled: () => true,
      directions: () => WAYS,
      acts: () => true,
      start: () => {
        way = undefined;
        offset = 0;
        velocity = Swipe.createVelocity();
        zone.style.transition = 'none';
      },
      pointer: () => {},
      // The core reads it once the finger has gone SLOP px.
      direction: (direction) => {
        way = direction;
      },
      move: (_pointer, pointers) => {
        if (!wants(WAYS, way) || way === undefined) return;
        const down = [...pointers.values()].filter((p) => p.end === undefined);
        const moved = Swipe.movement(down);
        offset = Math.max(0, Swipe.along(way, moved));
        velocity.add(performance.now(), offset);
        zone.style.transform = `translateX(${moved.dx}px) rotate(${moved.dx / 24}deg)`;
      },
      end: (pointers, { interrupted }) => {
        const [finger] = pointers.values();
        const speed = velocity.at(performance.now(), offset);
        const commits =
          !interrupted && Swipe.commits(Swipe.DEFAULT_COMMIT, offset, speed);
        const direction =
          finger === undefined ? undefined : directionOf(finger.dx, finger.dy);
        const { projected } = Swipe.release(offset, speed);
        zone.style.transition = 'transform 250ms cubic-bezier(0.2, 0, 0, 1)';
        // Committed, it flies off the way it went, as far as momentum says.
        const sign = direction === 'left' ? -1 : 1;
        zone.style.transform = commits
          ? `translateX(${sign * Math.max(projected, 500)}px) rotate(${sign * 20}deg)`
          : '';
        setVerdict({ direction, offset, velocity: speed, commits });
      },
    });

    // The touch source: every touch pointer, as plain samples.
    const sample = (event: PointerEvent): PointerSample<Target> => ({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      target: event.target instanceof Element ? event.target : null,
    });
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') provider.sink.down(sample(event));
    };
    const move = (event: PointerEvent) => provider.sink.move(sample(event));
    const up = (event: PointerEvent) => provider.sink.up(sample(event));
    const cancel = (event: PointerEvent) =>
      provider.sink.cancelAll(event.timeStamp);
    addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', cancel);
    return () => {
      removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
      removeListener();
      removeZone();
    };
  }, []);

  return (
    <>
      <div className="stage">
        <div ref={card} data-zone="" data-testid="card" className="card">
          <p className="name">Asha, 29</p>
          <p className="about">Likes long walks</p>
        </div>
      </div>
      <footer className="readout">
        <p className="label">
          Swipe.commits(DEFAULT_COMMIT) · Direction after {SLOP}px
        </p>
        <p data-testid="verdict" className="value">
          {verdict === undefined
            ? 'No swipe yet'
            : `${verdict.direction} · ${Math.round(verdict.offset)}px · ${verdict.commits ? 'commits' : 'cancels'}`}
        </p>
      </footer>
    </>
  );
}

// Plain CSS: the core needs no styling system.
const STYLE = `
body { margin: 0; font: 16px/1.4 system-ui, sans-serif; color: #0a0a0a; background: #fff; }
.screen { display: flex; flex-direction: column; height: 100dvh; padding: 16px; box-sizing: border-box; }
h1 { margin: 0; font-size: 20px; font-weight: 600; }
.hint { margin: 0; font-size: 14px; color: #737373; }
.readout { position: fixed; left: 16px; right: 16px; bottom: 24px; z-index: 10; padding: 16px 20px; border-radius: 16px; background: #0a0a0a; color: #fff; box-shadow: 0 10px 25px rgba(0,0,0,.2); }
.label { margin: 0; font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; opacity: .6; }
.value { margin: 0; font-size: 22px; font-weight: 600; }
.stage { flex: 1; display: flex; align-items: center; justify-content: center; }
.card { display: flex; flex-direction: column; justify-content: flex-end; width: 256px; height: 320px; padding: 20px; box-sizing: border-box; border-radius: 24px; color: #fff; background: linear-gradient(160deg, #a78bfa, #4c1d95); box-shadow: 0 20px 25px rgba(0,0,0,.15); touch-action: none; user-select: none; }
.card p { margin: 0; }
.name { font-size: 24px; font-weight: 600; }
.about { font-size: 14px; opacity: .8; }
`;

export default Proof.browser({
  title:
    'Fingers from your own touch source swipe: a slow nudge cancels, a long swipe commits',
  description:
    'The page feeds createGestureProvider its own pointer events as plain finger samples, with no web-platform in between. The core reads which way the finger went, and the Swipe rules decide on release whether it went far or fast enough.',
  page: (root) => {
    const app = createRoot(root);
    const style = document.createElement('style');
    style.textContent = STYLE;
    document.head.append(style);
    app.render(
      <main className="screen">
        <h1>Discover</h1>
        <p className="hint">Swipe the card left to pass.</p>
        <Card />
      </main>,
    );
    return () => {
      app.unmount();
      style.remove();
    };
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The card shows', '[data-testid=card]');
      const verdict = yield* tab.text('[data-testid=verdict]');
      yield* Proof.assert('no swipe yet', verdict === 'No swipe yet');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture(
        'Nudge the card a little, slowly',
        Gesture.swipe('[data-testid=card]', 'left', {
          distance: 50,
          duration: '800 millis',
        }),
      );
      const nudge = yield* tab.text('[data-testid=verdict]');
      yield* tab.gesture(
        'Swipe the card left',
        Gesture.swipe('[data-testid=card]', 'left', { distance: 200 }),
      );
      return { nudge, swipe: yield* tab.text('[data-testid=verdict]') };
    }),
  verify: ({ nudge, swipe }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        `a slow 50px nudge cancels (${nudge})`,
        nudge.startsWith('left') && nudge.endsWith('cancels'),
      );
      yield* Proof.assert(
        `a 200px swipe left commits (${swipe})`,
        swipe.startsWith('left') && swipe.endsWith('commits'),
      );
    }),
});
