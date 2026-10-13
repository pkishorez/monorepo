# A View is one function of its Instance, plus data from its parent

Partly superseded: `self` has no `frame`, since the Frame was removed (see ADR 0006), and data from the parent is the Child's Props, declared by its Actor ([ADR 0022](0022-a-child-reads-props-from-its-parent.md)). [ADR 0028](0028-a-parent-view-can-read-its-children.md) lets a parent View read its Children.

Supersedes the one-draw-per-State form of [ADR 0001](0001-nodes-decide-what-exists.md)'s Views.

`View.make(Actor, (self, props) => …)` draws every State of an Actor with one function. `self` is the Instance (`_tag`, Model, State, Children, `send`, `frame`) and `root`, the `ref` and `style` a parent hands the element the View spreads it on. `props` is data from the parent, for drawing only: the Child's Update never sees it, and a function is a type error. A parent places a Child with `<ChildView instance={handle} />`. Once an Instance stops, its View keeps drawing the last data it had, so an exit animation still shows something.

## Considered Options

- **One draw per State, each its own component (until now)**: rejected. Every Transition unmounted the DOM, so inputs lost focus and nothing could animate from one State to the next.
- **A parent reading a Child's data in its View**: rejected. It ties the parent's drawing to the Child's insides; a Child that has something to say sends a Message.
- **A parent drawing its grandchildren**: rejected. A Child can draw its own Children wherever it likes, with a portal if they belong elsewhere on the page.
- **Function props and imperative handles**: rejected. They are a second way for a View to change the app, outside Update, and the Log would show the wrong View as the Source.
- **Kabuki's own animation API**: rejected. `root` is enough for Framer Motion's `motion.create`.
- **Keeping a stopped Instance's last data in the Runtime**: rejected. Only the View knows when nothing draws it any more; it keeps the data in a ref and forgets it on unmount.

## Consequences

- Hooks in a draw function are called in every State, so a hook used in one State only moves into a small component.
- `motion.create(SomeView)` hands the View a new `style` object on every render, so a View compares `style` by its values: the motion component renders with its parent, the View's draw does not.
- A View renders only when its Instance or its props change, without the React Compiler: Views are memoized, Handles never change, and `children` stays the same object while the Children's IDs do.
