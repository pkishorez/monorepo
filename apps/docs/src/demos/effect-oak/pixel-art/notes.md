# Pixel art

Status: partial. Tools and Export are Child Actors; the grid-size picker and its
confirmation could not be one (blocker below).

## What was ported

Foldkit's `pixel-art`: a 8/16/24/32 grid, Brush, Fill and Eraser, mirror
left-right and top-bottom, five palettes of 16 colors, undo/redo with a
clickable history, Clear, a confirmation before a resize throws the picture
away, PNG export with an error dialog, keys (B/F/E, ⌘Z, ⇧⌘Z, ⌘Y), and the
picture saved to localStorage.

```
PixelArt (root)                requires PictureStore (from the Layer)
  Loading                      Lifetime: PictureStore.load → Loaded { saved }
  Ready { grid, size, undo, redo, theme, color, tool, mirror, drawing, hovered, pendingSize }
                               Provides Brush (a Request) and Printable (reads the picture as colors)
                               finished changes → Command: PictureStore.save → SucceededSave | FailedSave
  ├─ tools: Tools              Model { tool, mirror }; every change → Command: Brush.changed (a Request)
  └─ export: Export            Idle → Exporting → Idle | Failed { error }
                               ClickedExport → Command reads Printable, draws a PNG, downloads it
easel/   the grid, swatches, history thumbnails, the resize dialog, keys; not Actors
grid.ts  the picture as data: paint, fill, mirror, history
store.ts PictureStore Capability and its localStorage Layer
```

## Deviations

- **Flags became a Loading State**, as in [todo](../todo/notes.md): the saved
  picture arrives as `Loaded`, so Replay sees it.
- **Tools is a Child that reports up.** It owns the tool and the mirrors (not
  saved, as in Foldkit) and tells the editor through the `Brush` Request; the
  editor keeps a copy to paint with. One change is two Messages.
- **Export is a Child** with its own States and error dialog. It reads the
  picture from the `Printable` Capability in its Command, so the editor does not
  hand it the grid. `colors` is an Effect over the editor's current State,
  since the Capability is built once on entering Ready.
- The grid-size picker, the resize confirmation, the palette and the history
  are drawn by the editor's View, from its State.
- `@foldkit/ui` Dialog, Listbox and RadioGroup are web-platform AlertDialog,
  NativeSelect and Buttons with radio roles. `KeyValueStore` is a small
  `PictureStore` Capability, as in todo.
- Keys and the pointer release are View hooks, not Subscriptions.
- A stroke ends on `pointerup` anywhere; hover is a Message per cell entered
  (Foldkit does the same), used to outline the cells a stroke would paint.

## Blockers

- **A parent cannot pass data to a Child.** A Child's Update and View see only
  its own Model; Capabilities reach only its Commands and Lifetimes. A `Resize`
  Child (the size picker and its confirmation) needs the current size to
  draw the picker and whether the picture is empty to decide whether to ask.
  It could only read them in a Command and send itself a copy, so resizing
  stayed in the root. Foldkit passes such data to a Submodel's view as
  `viewInputs`. An API could let a parent's View give a Child's View input,
  `<ResizeView node={children.resize} input={{ size: state.size }} />`, typed
  by the Child's View. It is safe for Replay: the input comes from the
  parent's replayed State.
- The Tools copy in the editor exists because a parent cannot read its
  Children (by design, as in [form](../form/notes.md)).

## Testing

Foldkit's stories paint, drag, undo, redo, mirror, fill, resize with and
without confirmation, clear, and resolve `SaveCanvas` and `ExportPng` both
ways. Its scenes click through tools, swatches and dialogs, resolving the
dialogs' Commands and `Mount` resources. It also has benchmarks
(`main.bench.ts`, `comparison.bench.test.ts`) for Update and view cost.

What Effect Oak would need:

- Named Commands (roll-up blocker 4) for `save` and the export, and to check
  that a stroke saves once, on release.
- A typed `Actor.step` (blocker 5). `grid.ts` is plain functions and can be
  tested today.
- Testing the Requests: Tools with a fake `Brush`, Export with a fake
  `Printable`. `Runtime.start` with a stub Layer can do both today.
- Drawing a View from a given State (blocker 5), and a way to reach a Child's
  Handle in a test.
- A benchmark needs nothing new: Update is a plain function per State.
