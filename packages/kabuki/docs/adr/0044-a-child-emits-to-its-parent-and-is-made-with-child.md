# A Child Emits to its parent, and is made with `child`

Amends [ADR 0027](0027-a-parent-controls-its-children-only-through-data.md) and [ADR 0034](0034-a-child-is-written-as-a-worker-is.md). A parent controls a Child through data, and until now a Child could tell its parent something only through a Capability the parent Provided: a Service tag, a line in the Child's Requires, and a Layer whose function Sent the parent a Message. About thirty Actors did exactly that, one level down, which is what a Capability is too much for. A Child now **Emits**. Its Definition names what it may tell its parent, `emits: { SignedIn: { user: Schema.String } }`, as a tagged union; an Update returns `emit`, one or a list, checked against it. The parent's slot for the Child turns each one into one of the parent's own Messages, `emits: { SignedIn: ({ user }, key) => ({ _tag: 'LoggedIn', user }) }`, given the Child's key, and the Runtime Sends it to the parent right after the Child's Message, through the one Mailbox. It is in the History as its own entry, its Source `{ kind: 'emit', instance, name }`, so Replay never turns it again. One the slot does not turn is not heard, so a Child fits any parent. Capabilities stay for what any Actor further down may need, as context does in React.

Turning an event into a Message is a function written in the slot, and TypeScript cannot type its event from the `actor` written beside it in the same object: the whole Build is one inference. So a level's `children` is a function handed `child`, and each Child is made with it: `children: (child) => ({ login: child(LoginLive, { … }) })`. `child` is typed for its level, the parent's Model, Props and Messages and its State narrowed in a State's block, and takes the Actor first, so every function after it is checked against both: the parent's data it reads, the Input and Props it hands, and what the Child Emits. Its three overloads are the three Conditions, chosen by which of `each` and `while` is written, so a View still finds a list, one that may be absent, or one. A Child that needs no Input and no Props is `child(TodosLive)`. What `child` makes is branded, so a slot written by hand does not compile: there is one way to write a Child.

## Considered Options

- **A Capability for every Child that talks back**: rejected. It is three parts for one call, and the call is not in the parent's Updates where the change it causes is.
- **An output value the parent watches**: rejected. A value says what is true now, and a parent that reacts to its changes can miss one that changes twice in one Update; what a Child tells its parent happens once.
- **Forwarding by tag**, `emits: { SignedIn: 'LoggedIn' }`: rejected. Typed without a function, but it can neither rename nor compute, and the Child of `each` would have to carry its own key.
- **The parent's Definition naming its Children**, as a page names its pages: rejected. Typed in full, but each Child that Emits is wired in two places.
- **A helper on the parent's Definition**, `Gate.child(LoginLive, { … })`: rejected. It knows the parent, not the level it is written in, so `state` would not narrow in a State's block.
- **`child` beside the plain slot**: rejected. Two ways to write a Child, one of them checked less.

## Consequences

- Every Build writes `children` as a function; the repo moved with a codemod. std-toolkit's `Replicas.child([…])` is `Replicas.actor([…])`, placed as `child(Replicas.actor([…]))`.
- A Child's Emits are checked against its Schema in the Update that returns them, as its Model is, and the parent's Message they become is checked as any Message Sent is.
- What a Child Emits as it is Invoked, or the root's, is not heard: there is no Update, or no parent.
- A page's pages are Children Kabuki adds, so a page cannot turn what a page under it Emits; a page that needs that is a reason to revisit it.
