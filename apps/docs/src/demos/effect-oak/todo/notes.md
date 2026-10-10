# Todo

Status: partial. Everything works and persists, but the todo rows are not
Actors.

## What was ported

Foldkit's `todo`: add, toggle, rename (click the text), delete, filter, mark
all, clear completed, all saved to localStorage.

```
Todos (root)                       requires TodoStore (from the Layer)
  Loading                          Lifetime: TodoStore.load → Loaded { todos }
  Ready { todos, filter, editing } Provides Composing
  └─ composer: Composer            Model { text }; Submitted → Command → Composing.add(text)
                                   (a Request: it reaches Todos as RequestedAdd)
item/    TodoItem, a drawing of one row (view or edit); not an Actor
footer/  Footer, counts, filters and list actions; a drawing
list.ts  Schemas and pure list changes
store.ts TodoStore Capability and its localStorage Layer
```

Adding a todo goes: `Submitted` (composer) → Command calls `Composing.add` →
`RequestedAdd` (Todos) → Command picks a random id and reads the wall clock →
`CompletedGenerateTodo` → the list changes and a Command saves it →
`SucceededSave` or `FailedSave`.

## Deviations

- **Flags became a Loading State.** Foldkit reads localStorage before `init`
  through `flags`. Here the root starts in `Loading`, and its Lifetime reads the
  `TodoStore` Capability and sends `Loaded { todos }`. The saved todos arrive as a
  Message, at Time 0, so Replay shows them without touching localStorage.
- **The new-todo field is a child Actor** (`Composer`) that hands new todos up
  through a Request. In Foldkit it is part of the one Model. The field clears
  on submit, not after the id is generated.
- `KeyValueStore` from `@effect/platform-browser` is replaced by a small
  `TodoStore` Capability over `localStorage`. The docs app does not depend on the
  platform package.
- Rows and footer use web-platform Checkbox, Input and Button. Escape cancels an
  edit.

## Blockers

- **No list of Children** (now possible with `Actor.many` and `invoke`; this demo still keeps the list as data) (same as [../counters/notes.md](../counters/notes.md)).
  Each todo would naturally be a `TodoItem` Actor with States `Viewing` and
  `Editing { text }`: its own edit text, and a Request to the list for
  toggle, rename and delete. With fixed Children it cannot be, so `editing`
  lives in the root's `Ready` State as Foldkit has it, and rows are plain
  React drawings sending the root's Messages.
- **Children cannot be given input when they are created.** (now possible: a Child's `init` takes its Input; this demo is unchanged) `init` takes
  nothing. A single `Editor` Child, created on entering an `Editing` State,
  would need the todo's text to start from. It could only get it by reading a
  Capability in a Lifetime and sending itself a Message. That costs an extra
  Message per edit, so editing stayed in the root. An API could be
  `children: { Editing: { editor: Editor.with((state) => ({ text: state.text })) } }`,
  with `init: (input) => …`. The input would be computed in Update's pure
  world, so Replay gets the same value.

## Testing

Foldkit's stories check, for example, that `AddedTodo` with text asks for
`GenerateTodo` and that blank text asks for nothing (`Command.expectNone()`).
Each list change asks for `SaveTodos({ todos })`. The test resolves Commands
by hand: `Command.resolve(SaveTodos, SucceededSaveTodos({ todos }))`. Its scenes
type into the form, submit it, resolve `GenerateTodo`, then check the rendered
list, and check that a failed save keeps the in-memory list.

What Effect Oak would need:

- **Named Commands.** Here a Command is an anonymous `Effect`. A test cannot
  ask "was SaveTodos asked for, with these todos?" or answer it with a chosen
  Message without running it. Something like
  `Command.make('SaveTodos', { todos }, (args) => effect)` would carry a name
  and arguments that Update tests can compare, while the Runtime still runs the
  Effect.
- A typed `Actor.step` that returns those Commands (see
  [../counter/notes.md](../counter/notes.md)).
- **Lifetimes as data in tests**: a way to emit a Lifetime's Message, the way
  Foldkit has `Subscription.emit`. Today `Runtime.start` with a test
  `TodoStore` Layer works, but then it is an integration test.
- A way to test a Request: drive the `Composer` with a fake `Composing`, or
  check that `Todos` Provides a `Composing` whose `add` sends `RequestedAdd`.
  `Runtime.start` with a stub Layer can do the first today.
- Drawing a View from a given State (see the counter notes), and a way to
  reach a Child's Handle in a test (`children.composer`).

## Also surprising

- `Clock.currentTimeMillis` in a Command is the wall clock, while
  `Effect.sleep` in a Command sleeps in the app's Time. That is right for
  `createdAt`, but it is easy to mix up.
- Every keystroke is a Message (`Typed`, `UpdatedEditingTodo`), so the Log
  fills quickly while typing. Foldkit does the same.
