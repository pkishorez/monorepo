# Kanban

Status: works. Drag cards within and between columns with the pointer,
Escape cancels, add cards per column, and the board is saved to localStorage.

## What was ported

Foldkit's `kanban`: three columns of cards, pointer drag and drop with a live
preview of where the card lands, an add-card form per column, and the board
kept in localStorage.

```
Board (root)                            Model { columns }; requires BoardStore (from the Layer)
  Loading                               Lifetime: BoardStore.load → Loaded
  Idle                                  Provides Adding
  ├─ todo: AddCard(todo)                Closed | Open { title }; Submitted → Command
  ├─ in-progress: AddCard(in-progress)    → Adding.add(columnId, title) (a Request)
  └─ done: AddCard(done)
  Dragging { cardId, columnId, index }  Lifetime: follow(cardId), pointer and Escape
                                        → Hovered | Dropped | Cancelled
columns/      Columns Schema, the default board, moveCard, appendCard
board-store/  BoardStore Service and its localStorage Layer
drag/         follow(cardId): the drag as a Stream; data attributes for the View
card/         CardTile, a drawing
add-card/     makeAddCard(columnId): the AddCard Node and View, the Adding Service
```

Pressing a card sends `PickedUp` and the Board goes `Dragging`. Its Lifetime
listens to the document: every pointer move is hit-tested against the
columns and cards the View marks, and only a change of target becomes a
`Hovered` Message (`Stream.changesWith`). So a drag across the board is a few
Messages, and the View draws the held card at `columnId` / `index`. Letting go
sends `Dropped`: the columns change, a Command saves them, and the Board is
`Idle` again. Leaving `Dragging` removes the listeners.

## Deviations

- **No library.** Foldkit uses its `DragAndDrop` UI Submodel. This uses plain
  pointer events and `document.elementsFromPoint` in a Lifetime.
- **No ghost card following the pointer.** The held card is drawn, outlined,
  where it would land. A ghost could be moved through a ref by the View, since
  the pointer position is not app data; it was left out to keep the demo small.
- **No keyboard drag** and no screen reader announcements.
- **No fractional sort keys** (`fractional-indexing` is not a dependency): a
  card's place is its index in its column's array.
- **Each column has its own add-card form**, so two can be open at once.
  Foldkit has one form and `maybeNewCardColumnId`.
- Card ids come from `Random` in a Command, as in todo, not `crypto.randomUUID`.
- Focusing the add-card input is `autoFocus` on the open form, not a
  `FocusAddCardInput` Command.

## Blockers

- **No list of Children** (blocker 1). The columns are data, but each needs
  an add-card Node. With fixed Children the board can only have one per known
  column id, made by a factory (`makeAddCard('todo')`) that bakes the id in
  because a Child cannot be given it (blocker 3). A saved board with other
  columns would have no add-card forms.
- **Children belong to exactly one State** (blocker 10). The add-card forms
  live in `Idle`, so starting a drag destroys them and an open form is lost.
  Keeping them across `Idle | Dragging` would need Children keyed by a set of
  States. The other way, drag as Model data instead of a State, loses the
  Lifetime that holds the listeners for exactly as long as the drag.

## Testing

Foldkit's stories drive the drag through the `DragAndDrop` Submodel's
Messages: `PressedDraggable`, `MovedPointer` with a `maybeDropTarget`, then
`ReleasedPointer`, resolve `SaveBoard` with `Command.resolve`, and check the
card's new place. Others open the add-card form, type, submit, and resolve
`GenerateCardId` and `SaveBoard`. Scenes check columns, counts, titles and the
add-card form.

What Effect Oak would need:

- A typed `Node.step` (blocker 5). The drag is plain Messages here
  (`PickedUp`, `Hovered`, `Dropped`), so a story needs no pointer at all.
- Named Commands (blocker 4) to check `SaveBoard` was asked for with the new
  columns and to answer `GenerateCardId`.
- Emitting a Lifetime's Message (blocker 6): `follow` reads the DOM, so a test
  would send `Hovered` itself rather than run it. `follow` alone can be tested
  in a DOM test by firing pointer events.
- Drawing a View from a given Model and State (blocker 5) for the scenes.

## Also surprising

- Replay draws a drag in progress, card held mid-air, because `Dragging`
  and its target are State.
- The Lifetime reads the DOM the View drew (data attributes). That ties the
  Node to its View; a hit-test Service given by the View would be cleaner
  but Views cannot provide Services.
