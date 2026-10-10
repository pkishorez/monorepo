import {
  GestureProvider,
  GestureZone,
  useGesture,
} from '@kstackz/web-platform/input';
import { Effect } from 'effect';
import { Gesture, Proof } from 'laymos/story';
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

// How long a still finger rests before it is a long press, in ms.
const LONG_PRESS = 450;
// How far, in px, a finger may drift and still be still.
const STILL = 10;

function Album() {
  const [opened, setOpened] = useState('Nothing yet');
  const [menu, setMenu] = useState<string>();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 pt-6">
        {['Beach', 'Hills'].map((name) => (
          <GestureZone key={name}>
            <Tile
              name={name}
              onTap={() => {
                setMenu(undefined);
                setOpened(`Opened ${name}`);
              }}
              onLongPress={() => {
                setMenu(name);
                setOpened(`Menu for ${name}`);
              }}
            />
          </GestureZone>
        ))}
      </div>
      {menu !== undefined && (
        <div
          data-testid="menu"
          className="mt-4 overflow-hidden rounded-2xl border bg-popover shadow-lg"
        >
          <p className="border-b px-4 py-2 text-xs text-muted-foreground">
            {menu}
          </p>
          {['Share', 'Favourite', 'Delete'].map((item) => (
            <p key={item} className="border-b px-4 py-3 last:border-b-0">
              {item}
            </p>
          ))}
        </div>
      )}
      <footer className="fixed inset-x-4 bottom-6 z-10 rounded-2xl bg-foreground px-5 py-4 text-background shadow-lg">
        <p className="text-xs font-medium tracking-wide uppercase opacity-60">
          Last touch
        </p>
        <p data-testid="last" className="text-2xl font-semibold">
          {opened}
        </p>
      </footer>
    </>
  );
}

// A watching useGesture tells a tap from a long press: no Directions, so it
// never keeps a touch from the browser, only times it.
function Tile(props: {
  readonly name: string;
  readonly onTap: () => void;
  readonly onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pressed = useRef(false);
  const { active } = useGesture({
    onStart: (pointers) => {
      const [finger] = pointers.values();
      pressed.current = false;
      timer.current = setTimeout(() => {
        if (finger === undefined) return;
        if (Math.hypot(finger.dx.get(), finger.dy.get()) > STILL) return;
        pressed.current = true;
        props.onLongPress();
      }, LONG_PRESS);
    },
    onEnd: (pointers, { interrupted }) => {
      clearTimeout(timer.current);
      const [finger] = pointers.values();
      if (interrupted || pressed.current || pointers.size !== 1) return;
      if (finger === undefined) return;
      if (Math.hypot(finger.dx.get(), finger.dy.get()) > STILL) return;
      props.onTap();
    },
  });
  return (
    <div
      data-testid={props.name}
      className={`flex aspect-square items-end rounded-2xl p-3 text-lg font-semibold text-white shadow-md transition-transform duration-150 ${active ? 'scale-95' : ''} ${props.name === 'Beach' ? 'bg-[linear-gradient(160deg,#38bdf8,#0369a1)]' : 'bg-[linear-gradient(160deg,#4ade80,#166534)]'}`}
    >
      {props.name}
    </div>
  );
}

export default Proof.browser({
  title: 'A tap opens a photo, and a long press shows its menu',
  description:
    'A useGesture that only watches times each touch: lifted quickly it is a tap, still for 450 ms it is a long press.',
  page: (root) => {
    const app = createRoot(root);
    void import('@kstackz/web-platform/theme/global.css').then(() =>
      app.render(
        <GestureProvider>
          <main className="h-dvh bg-background p-4 text-foreground">
            <h1 className="text-xl font-semibold">Album</h1>
            <p className="text-sm text-muted-foreground">
              Tap to open, hold for more.
            </p>
            <Album />
          </main>
        </GestureProvider>,
      ),
    );
    return () => app.unmount();
  },
  prepare: (browser) =>
    Effect.gen(function* () {
      const tab = yield* browser.open('mobile');
      yield* tab.waitFor('The album shows', '[data-testid=Beach]');
      const last = yield* tab.text('[data-testid=last]');
      yield* Proof.assert('nothing is open', last === 'Nothing yet');
      return { tab };
    }),
  act: ({ tab }) =>
    Effect.gen(function* () {
      yield* tab.gesture('Tap Beach', Gesture.tap('[data-testid=Beach]'));
      const afterTap = yield* tab.text('[data-testid=last]');
      yield* tab.gesture(
        'Hold a finger on Hills',
        Gesture.press('[data-testid=Hills]', '900 millis'),
      );
      return {
        afterTap,
        afterPress: yield* tab.text('[data-testid=last]'),
        menu: yield* tab.count('[data-testid=menu]'),
      };
    }),
  verify: ({ afterTap, afterPress, menu }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the tap opened Beach', afterTap === 'Opened Beach');
      yield* Proof.assert(
        'the long press showed the menu for Hills',
        afterPress === 'Menu for Hills' && menu === 1,
      );
    }),
});
