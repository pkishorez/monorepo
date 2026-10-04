# @kstackz/use-keys

Keyboard shortcuts for React: every key the page hears, and the Shortcuts and Sequences built on it.

## Big picture

An app that wants `j`/`k` to move through a list, `mod+k` to open a
palette, or `g g` to jump to the top has to listen to the whole page without
stealing typing from text fields, keys a component already handled, or the
browser's own keys. This package does that part once. A `KeysProvider`
hears every key on the page, `useKeys` reports each one, and `useShortcut`
and `useSequence` act on the keys they declare.

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

| Export         | What it does                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `KeysProvider` | Hears every key on the page for the hooks inside it, and sets the Repeat and Sequence timing.          |
| `useKeys`      | Reports every key from the first going down until the last lifts, with when each went down and lifted. |

### `@kstackz/use-keys/recognizers`

| Export        | What it does                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `useShortcut` | Acts when a key goes down while exactly its modifiers are down, and keeps that key from the page. |
| `useSequence` | Acts when Shortcuts are pressed in order, each in time, and says while one is under way.          |

## Usage

### Shortcuts for a list

`j` and ↓ move down, `g g` jumps to the top, and `mod+k` opens a palette
even from a text field. The provider at the root sets how long a key is held
before it repeats and how long a Sequence waits for its next key.

```tsx
import { KeysProvider } from '@kstackz/use-keys';
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

  useShortcut(['j', 'ArrowDown'], () => move(1), { enabled, repeat: true });
  useShortcut(['k', 'ArrowUp'], () => move(-1), { enabled, repeat: true });
  useShortcut({ key: 'g', shift: true }, () => toBottom(), { enabled });
  const { pending } = useSequence(['g', 'g'], () => toTop(), { enabled });
  useShortcut({ key: 'k', mod: true }, () => setPaletteOpen(true), {
    inTextEntry: true,
  });

  return pending ? <Hint>g…</Hint> : null;
}
```

- A Shortcut matches one key going down with exactly its modifiers: `j`
  never fires on Ctrl+J. A letter is written lowercase with `shift` for its
  capital, and Caps Lock is ignored; a symbol is the character typed.
  `mod` is Cmd on Apple platforms and Ctrl elsewhere.
- A plain key typed in a text field types. Only a Shortcut holding Ctrl, Alt
  or Cmd, with `inTextEntry`, works there. Escape leaves the field.
- `g` and `g g` together would conflict, and throw in development.

### Every key

`useKeys` watches without taking anything, for things like hold Space to pan.

```tsx
import { useKeys } from '@kstackz/use-keys';

function Canvas() {
  const { keys } = useKeys();
  const panning = keys.some((key) => key.name === 'Space' && key.upAt === null);
  return <Board panning={panning} />;
}
```

- `keys` lists every key from the first going down until the last lifts:
  `code` (the physical key), `name` (`'a'`, `'Shift'`, `'?'`), `downAt`, and
  `upAt` (`null` while down), in ms from the first key.
- Every key lifts exactly once, even when macOS loses a release under Cmd;
  when the page loses focus they all lift at once and `onEnd` says
  `interrupted`.
