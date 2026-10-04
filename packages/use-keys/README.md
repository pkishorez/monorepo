# @kstackz/use-keys

Keyboard shortcuts for React: every key the page hears, the Shortcuts and Sequences built on it, and an app's whole keyboard in one place.

## Big picture

An app that wants `j`/`k` to move through a list, `mod+k` to open a
palette, or `g g` to jump to the top has to listen to the whole page without
stealing typing from text fields, keys a component already handled, or the
browser's own keys. This package does that part once. A `KeysProvider`
hears every key on the page, `useKeys` reports each one, and `useShortcut`
and `useSequence` act on the keys they declare. `shortcut('mod+k')` and
`sequence('g g')` write those keys the same way everywhere, as plain values
an app can store.

For a whole app, `createKeys` names every Surface, the Actions each offers,
their descriptions and their default keys, in one place. The app says which
Surface is Active and gives each Action its Handler from the component that
has what it needs; the nearest Surface's Action wins a key, and the user's
own Bindings replace the defaults at once.

It is the keyboard counterpart of
[`@kstackz/use-gesture`](../use-gesture) and shares its ideas, but not its
zones: a key has no position, so the app keeps listeners apart with
`enabled`. A text field keeps its keys, Escape leaves it, and an element
marked `data-keys="enabled"` or `data-keys="disabled"` hands its keys over
or keeps them all. Two Enabled Shortcuts or Sequences whose keys conflict
throw in development.

The language is in [CONTEXT.md](./CONTEXT.md), and the decisions that shaped
it are in [docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @kstackz/use-keys react react-dom
```

- `react`, `react-dom`: the provider and the hooks are a React component and
  hooks.

## Exports

### `@kstackz/use-keys`

| Export         | What it does                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `KeysProvider` | Hears every key on the page for the hooks inside it, and sets the Repeat and Sequence timing.                       |
| `useKeys`      | Reports every key from the first going down until the last lifts in a ref, re-rendering only as they start and end. |
| `useKeysState` | Renders the keys in a `useKeys` ref, re-rendering on every key that goes down or lifts.                             |
| `shortcut`     | Writes a Shortcut from a string, `'mod+k'`, or an object, `{ key: 'k', mod: true }`.                                |
| `sequence`     | Writes a Sequence from a string, `'g g'`, or a list of its steps.                                                   |
| `describe`     | Writes a Shortcut or Sequence back as people write it, for a cheat sheet.                                           |

### `@kstackz/use-keys/recognizers`

| Export        | What it does                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `useShortcut` | Acts when a key goes down while exactly its modifiers are down, and keeps that key from the page. |
| `useSequence` | Acts when Shortcuts are pressed in order, each in time, and says while one is under way.          |

### `@kstackz/use-keys/surfaces`

| Export       | What it does                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `createKeys` | Makes an app's keyboard from one definition: its Provider, and typed `useSurface`, `useAction`, `useStatus` and `useRun`. |

## Usage

### Shortcuts for a list

`j` and ↓ move down, `g g` jumps to the top, and `mod+k` opens a palette
even from a text field. The provider at the root sets how long a key is held
before it repeats and how long a Sequence waits for its next key.

```tsx
import { KeysProvider, shortcut } from '@kstackz/use-keys';
import { useSequence, useShortcut } from '@kstackz/use-keys/recognizers';

<KeysProvider
  repeat={{ delay: 500, interval: 100 }}
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
  capital, and Caps Lock is ignored; a symbol is the character typed.
  `mod` is Cmd on Apple platforms and Ctrl elsewhere. Modifiers come in
  the order `mod`/`ctrl`, `alt`, `shift`, `meta`; a typo fails to compile.
- One Shortcut or Sequence is written inline; a list is always
  alternatives, written with `shortcut()` or `sequence()`.
- A plain key typed in a text field types. Only a Shortcut holding Ctrl, Alt
  or Cmd, with `inTextEntry`, works there. Escape leaves the field.
- `g` and `g g` together would conflict, and throw in development.

### One keyboard for the app

The inbox and its reply box are Surfaces, and the palette works everywhere.
`Escape` in the reply box discards the draft instead of closing everything.
The app keeps the Active Surface in its own state.

```tsx
import { sequence, shortcut } from '@kstackz/use-keys';
import { createKeys } from '@kstackz/use-keys/surfaces';

export const keys = createKeys({
  actions: {
    palette: {
      keys: [shortcut('mod+k')],
      description: 'Open the palette',
      inTextEntry: true,
    },
    close: { keys: [shortcut('Escape')], description: 'Close everything' },
  },
  surfaces: {
    inbox: {
      actions: {
        next: {
          keys: [shortcut('j')],
          description: 'Next thread',
          repeat: true,
        },
        top: { keys: [sequence('g g')], description: 'First thread' },
        sidebar: {
          keys: [shortcut('ctrl+h')],
          description: 'Go to the sidebar',
        },
      },
      surfaces: {
        reply: {
          actions: {
            discard: { keys: [shortcut('Escape')], description: 'Discard' },
          },
        },
      },
    },
    sidebar: {
      actions: {
        open: { keys: [shortcut('Enter')], description: 'Open folder' },
      },
    },
  },
});

function App() {
  const [surface, setSurface] = useState<Surface | null>('inbox');
  return (
    <keys.Provider
      surface={surface}
      onSurfaceChange={setSurface}
      bindings={saved}
    >
      <Inbox />
    </keys.Provider>
  );
}

function Inbox() {
  const [, setSurface] = keys.useSurface();
  keys.useAction('inbox.next', () => move(1));
  keys.useAction('inbox.sidebar', () => setSurface('sidebar'));
  const { sequence: under } = keys.useStatus();
  return under.type === 'possible' ? <Hint next={under.next} /> : null;
}
```

- An Action works while its Surface is Active or around the Active one, and
  it has a Handler. Global Actions work always, even with no Active Surface.
- The nearest Action wins a key: `inbox.reply.discard` Shadows `close`. An
  Action with no Handler Shadows nothing.
- A Surface with `isolated: true`, such as a dialog, stops the Surfaces
  around it while it is Active; `globals: false` stops the Global Actions.
- `bindings` holds the user's own, by Action id, as `shortcut()` and
  `sequence()` values; each replaces all of that Action's defaults.
- `useStatus` lists every Action and where it stands, and the Sequence under
  way; `useRun` runs an Action by id, as a command palette does.

### Every key

`useKeys` watches without taking anything, for things like hold Space to
pan. It never re-renders as keys change: read them from `keysRef`, react in
the callbacks, and use `active`, which changes only as the keys start and
end.

```tsx
import { useKeys, useKeysState } from '@kstackz/use-keys';

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
