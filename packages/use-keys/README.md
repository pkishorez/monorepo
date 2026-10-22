# @kestack/use-keys

Keyboard shortcuts for React: every key the page hears, the Shortcuts and Sequences built on it, and the Surfaces an app's keyboard is made of.

## Big picture

An app that wants `j`/`k` to move through a list, `mod+k` to open a
palette, or `g g` to jump to the top has to listen to the whole page without
stealing typing from text fields, keys a component already handled, or the
browser's own keys. This package does that part once. A `KeysProvider`
hears every key on the page, `useKeys` reports each one, and `useShortcut`
and `useSequence` act on the keys they declare. `shortcut('mod+k')` and
`sequence('g g')` write those keys the same way everywhere, as plain values
an app can store.

For a whole app, `createKeys` is the map: one typed definition of every
Surface, as they nest, and the Actions on each. `keys.Surface` puts the map
on screen, as many elements as draw a Surface, anywhere in the page.
`keys.useAction` says what an Action does, and `appearance` says how each
Surface looks. The keys tree is the only hierarchy: the provider holds the
Active Surface on it, and the UI follows. A click or focus enters a Surface,
an Action `enters` one, Escape leaves it, and a key climbs from it outward
until an Action takes it. Vim Mode, which the app keeps, turns on every
Action; with it off only the Actions marked `always` work.

It is the keyboard counterpart of
[`@kestack/use-gesture`](../use-gesture) and shares its ideas, but not its
zones: a key has no position, so the app keeps listeners apart with
`enabled`. A text field keeps its keys, Escape leaves it, and an element
marked `data-keys="enabled"` or `data-keys="disabled"` hands its keys over
or keeps them all. Two Enabled Shortcuts or Sequences whose keys conflict
throw in development.

The language is in [CONTEXT.md](./CONTEXT.md), and the decisions that shaped
it are in [docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @kestack/use-keys react react-dom
```

- `react`, `react-dom`: the provider and the hooks are a React component and
  hooks.

## Exports

### `@kestack/use-keys`

| Export         | What it does                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `KeysProvider` | Hears every key on the page for the hooks inside it, sets the Repeat and Sequence timing, and holds Vim Mode.       |
| `useKeys`      | Reports every key from the first going down until the last lifts in a ref, re-rendering only as they start and end. |
| `useKeysState` | Renders the keys in a `useKeys` ref, re-rendering on every key that goes down or lifts.                             |
| `shortcut`     | Writes a Shortcut from a string, `'mod+k'`, or an object, `{ key: 'k', mod: true }`.                                |
| `sequence`     | Writes a Sequence from a string, `'g g'`, or a list of its steps.                                                   |
| `describe`     | Writes a Shortcut or Sequence back as people write it, for a cheat sheet.                                           |

### `@kestack/use-keys/recognizers`

| Export        | What it does                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `useShortcut` | Acts when a key goes down while exactly its modifiers are down, and keeps that key from the page. |
| `useSequence` | Acts when Shortcuts are pressed in order, each in time, and says while one is under way.          |

### `@kestack/use-keys/surfaces`

| Export                     | What it does                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `createKeys`               | Makes an app's keyboard from one typed definition of its Surfaces and Actions, and gives the parts below, typed by it.     |
| `keys.Provider`            | Holds the Active Surface and Vim Mode, the timing, the appearance and the user's own keys, and makes the Active keys work. |
| `keys.Surface`             | Draws a Surface: a `div`, or its one child with `asChild`, carrying its state and the class names for it.                  |
| `keys.useAction`           | Says what an Action does while the calling component is mounted.                                                           |
| `keys.useSurface`          | Says whether a Surface is Active, its state for styling, and its Mode.                                                     |
| `keys.useActive`           | Gives the Active Surface's name.                                                                                           |
| `keys.useKeyboard`         | Gives the path to the Active Surface, the Mode and the Sequence under way, `enter`, `leave`, and Vim Mode.                 |
| `keys.useAvailableActions` | Lists every Action that works now, nearest Surface first, and whether each is Shadowed.                                    |
| `revealInView`             | Scrolls an element just into view at once, for a cursor moved from the keyboard.                                           |

## Usage

### Shortcuts for a list

`j` and ↓ move down, `g g` jumps to the top, and `mod+k` opens a palette
even from a text field. The provider at the root sets how long a key is held
before it repeats and how long a Sequence waits for its next key.

```tsx
import { KeysProvider, shortcut } from '@kestack/use-keys';
import { useSequence, useShortcut } from '@kestack/use-keys/recognizers';

<KeysProvider
  repeat={{ delay: 200, interval: 40 }}
  sequence={{ timeout: 1000 }}
>
  <Inbox />
</KeysProvider>;

function Inbox() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const enabled = !paletteOpen;

  const down = [shortcut('j'), shortcut('ArrowDown')];
  const up = [shortcut('k'), shortcut('ArrowUp')];
  useShortcut(down, () => move(1), { enabled, repeat: true });
  useShortcut(up, () => move(-1), { enabled, repeat: true });
  useShortcut('shift+g', () => toBottom(), { enabled });
  const { pending } = useSequence('g g', () => toTop(), { enabled });
  useShortcut('mod+k', () => setPaletteOpen(true), { inTextEntry: true });

  return pending ? <Hint>g…</Hint> : null;
}
```

- A Shortcut matches one key going down with exactly its modifiers: `j`
  never fires on Ctrl+J. A letter is written lowercase with `shift` for its
  capital, and Caps Lock is ignored; a symbol is the character typed. With
  `alt`, a letter or digit is the key pressed, so `alt+2` matches macOS's
  Option+2, which types `™`.
  `mod` is Cmd on Apple platforms and Ctrl elsewhere. Modifiers come in
  the order `mod`/`ctrl`, `alt`, `shift`, `meta`; a typo fails to compile.
- One Shortcut or Sequence is written inline; a list is always
  alternatives, written with `shortcut()` or `sequence()`.
- A plain key typed in a text field types. Only a Shortcut holding Ctrl, Alt
  or Cmd, with `inTextEntry`, works there. Escape leaves the field.
- `g` and `g g` together would conflict, and throw in development.

### One keyboard for the app

A session holds a list driven by `j` and a composer. `mod+k` opens an
isolated palette from anywhere, even while typing. The app keeps Vim Mode
in localStorage.

```tsx
import { createKeys, revealInView } from '@kestack/use-keys/surfaces';

export const keys = createKeys({
  app: {
    focusable: false,
    actions: {
      palette: {
        keys: 'mod+k',
        label: 'Palette',
        always: true,
        enters: 'palette',
      },
    },
    surfaces: {
      session: {
        initial: true,
        actions: { next: { keys: 'j', label: 'Next message', repeat: true } },
        surfaces: { composer: { label: 'Composer' } },
      },
      palette: {
        isolated: true,
        actions: { clear: { keys: 'Escape', label: 'Clear', always: true } },
      },
    },
  },
});

function App() {
  const [vim, setVim] = useLocalStorage('vim', false);
  return (
    <keys.Provider vim={vim} onVimChange={setVim}>
      <keys.Surface id="session" className="pane">
        <Messages />
      </keys.Surface>
      <keys.Surface id="composer" asChild>
        <Composer />
      </keys.Surface>
      <PaletteWhenActive />
    </keys.Provider>
  );
}

function PaletteWhenActive() {
  return keys.useSurface('palette').active ? <Palette /> : null;
}

function Messages() {
  const [at, setAt] = useState(0);
  keys.useAction('session.next', () => {
    setAt(at + 1);
    revealInView(document.getElementById(`message-${at + 1}`));
  });
  return <List at={at} />;
}
```

- The composer is drawn beside the session, not in it, and is still its
  child: the keys tree decides, never the React or DOM tree. A key climbs
  from the Active Surface outward; the nearest Action with a Handler wins,
  and `{ enabled: false }` Shadows nothing. Two Actions with the same keys on
  one Surface throw in development.
- `mod+k` has no Handler: it `enters` the palette, which is Active at once,
  drawn or not. The app draws it while `useSurface('palette').active`.
  Escape runs its `clear` Action while one is Enabled, then leaves it, which
  closes it and goes back to where it was opened. No key climbs out of an
  Isolated Surface.
- Every Action is Vim only unless `always`. In a text field plain keys type;
  `mod` keys still work, and plain keys only with `inField`. Escape leaves a
  text field first.
- Each element carries `data-surface` (the name), `data-state` (`active`,
  `parent`, `inactive`, or `off` with Vim Mode off) and, while Active,
  `data-mode`. `appearance={{ active, parent, inactive }}` adds class names
  by state, on the Provider or one Surface. `bindings={{ 'session.next': 'n' }}`
  replaces an Action's keys with the user's own.
- `useKeyboard` gives a status bar the path, the Mode, the Sequence under
  way and Vim Mode; `useAvailableActions` fills a help sheet or a palette,
  each with its `run`.

### Every key

`useKeys` watches without taking anything, for things like hold Space to
pan. It never re-renders as keys change: read them from `keysRef`, react in
the callbacks, and use `active`, which changes only as the keys start and
end.

```tsx
import { useKeys, useKeysState } from '@kestack/use-keys';

function Canvas() {
  const board = useRef<BoardHandle>(null);
  const { keysRef, active } = useKeys({
    onKey: () => {
      const space = keysRef.current.some(
        (key) => key.name === 'Space' && key.upAt === null,
      );
      board.current?.setPanning(space);
    },
  });
  return <Board ref={board} dimmed={active} />;
}

function KeyDebugger() {
  const keys = useKeysState(useKeys().keysRef); // re-renders on every key
  return <pre>{keys.map((key) => key.name).join(' ')}</pre>;
}
```

- `keysRef.current` lists every key from the first going down until the last lifts:
  `code` (the physical key), `name` (`'a'`, `'Shift'`, `'?'`), `downAt`, and
  `upAt` (`null` while down), in ms from the first key.
- Every key lifts exactly once, even when macOS loses a release under Cmd;
  when the page loses focus they all lift at once and `onEnd` says
  `interrupted`.
