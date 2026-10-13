# Module design

Read this when choosing boundaries, placing or lifting a capability, splitting
or combining modules, opening a module into nested modules, or designing
orchestration. Concepts stay short; scenarios decide.

## Module boundary

A module owns one coherent capability and the design decisions most likely to
change behind it. Its door reveals the promise, not representation or sequence.

**Where do I split?**
Split where a part has its own promise, change reason, and independently testable door.

**Should processing steps become modules?**
Only when they hide independent decisions; runtime order alone is not a boundary.

**Where do data and its operations live?**
Together, behind the module that hides the representation.

**What if history shows two parts always change together?**
Treat co-change as evidence to combine them, never as the decision by itself.

## Deep module

A deep module absorbs substantially more complexity than its door exposes while
keeping its interior navigable. A narrow door does not excuse a tangled interior.

**How should a reader enter a directory module?**
Through its door, then its execution story; use the `deep-module` skill for shape.

**May a small capability be a module?**
Yes, when it hides a real policy behind a stable concept.

**Do several functions need a namespace object?**
Use one for a coherent caller concept; grouping alone does not create depth.

**The door is tiny but the orchestrator is huge. Is it deep?**
No. Group its independent concerns behind named internal capabilities.

## Readable execution story

A module's `<name>.ts` fulfils its promise through named collaborators.
A reader follows one branch at a time while holding two or three concepts.

**The orchestrator handles more than three concepts at once. What now?**
Group related steps behind a named internal capability.

**The module has more than five direct collaborators. What now?**
Review the story and group its concerns; above ten, presume the boundary is wrong.

**Do those counts decide the boundary?**
No. They trigger review; capability, change, and cognitive load decide.

**Is file length the test?**
No. Test the number of responsibilities, state owners, and policy boundaries.

**Must the story be chronological?**
No. Event-driven code names each interaction and delegates its behavior.

## Split and combine

Split independently changing promises; combine coordination callers should not
manage. Private children may remain when they make the parent story clearer.

**Two modules require callers to know their order or shared state. What now?**
Combine them behind one useful operation.

**Two modules depend on each other. What now?**
Re-cut the responsibilities or split one into lower and higher parts.

**A folder is large. Should I split it?**
Only when the new parts pass the promise, change, and independent-door tests.

**Several files serve one private responsibility. What now?**
Make a nested folder without an index: part of the inside. Give it an index
only when its dependency direction matters, which makes it a Nested Module.

## Nested Modules

A Module that holds Modules is their Wrapper. Its own files may use every
nested Index for free; the nested Modules are islands to each other until the
Config writes Rules among them.

**When does a folder inside a module get an index file?**
When it stands alone as a capability and its dependency direction matters.

**What must connect to the parent's own files?**
Every Nested Module should be used by its parent or by a sibling under a Rule;
one nothing uses is dead.

**Does a Nested Module need `index.ts`?**
Yes. That is what makes it a Module; siblings and outsiders use its Index.

**What does a Rule to a Module that holds Modules grant?**
That Module and every Module nested in it. When the source needs one nested
part, point the Rule at that part; one Rule to the parent covers the parent
and its parts, so a second Rule to a part is unused.

**A Wrapper holds one Module and that Module's parts as siblings. What now?**
Make the Wrapper the Module. The entry's files become its own files and the
parts nest inside it, where its own files reach them for free. A Wrapper
around a single Module adds a level and hides nothing.

**Should Rules among siblings mirror runtime calls?**
No. Rules express correctness dependencies, not execution chronology.

**When should A depend on B?**
When B simplifies A, B stands without A, and A needs B to fulfil its promise.

**A sibling wants something from the parent. What now?**
It is a user of the parent, not a part of it. Move it out, or write an
Exception with a Reason and plan the move.

## Placement

Two forces meet in the tree. Hiding pushes a capability down, into the one
Module that uses it. Sharing pulls it up, to where its users meet. The
direction settles both: a parent uses its children for free, siblings use
each other by Rule, and nothing uses its own ancestor.

**Where does a capability live?**
With its owner: inside the Module whose promise it serves, as deep as that is.

**Only one Module uses it. Where does it go?**
Nested inside that Module, private. Nothing outside needs to know it exists.

**A second Module needs it. Lift it?**
Not if it still has an owner. Write a narrow Rule to the nested Module where
it lives; private means closed by default, not closed forever.

**When does it lift?**
When no single owner remains: it serves its users more than its parent. Lift
it to the lowest level where all its users meet, as their sibling.

**Lifted code: a sibling with Rules, or a foundation under `*`?**
A sibling with a Rule from each user. `*` is for a true foundation every
sibling uses; it is never a place to put things nobody owns.

**Its users drop back to one. What now?**
Push it back down into that user. A shared Module with one user hides nothing.

**A nested Module needs a type from its parent's own files. What now?**
Move it into a Nested Module and give the siblings a Rule to it. A parent's own
files compose; they use children and are never used by them.

**A deep Module imports a sibling of its ancestor. Is that wrong?**
No. That is another subtree, reached by an inherited Rule. Write the Rule from
the narrowest source that needs it: `src/a/x -> src/b`, not `src/a -> src/b`.

**A deep Module imports its own ancestor. Is that wrong?**
Yes. It uses the thing it sits inside. Move it out, or extract what it needs
into a Nested Module. An Exception is debt: its Reason names the move that
ends it.

**Should I group with a Module or a Wrapper?**
A Module to hide: outsiders see one Index. A Wrapper only to group: a Rule to
it reaches every Module inside.

**May a parent's Index re-export a child?**
Only as part of the parent's own promise. A pass-through re-export makes the
child public without anyone deciding it should be.

## Orchestrator

An orchestrator is a module that adds workflow policy while coordinating lower
capabilities. It is a relative role, not a configured kind or mandatory layer.

**What belongs in an orchestrator?**
Workflow sequencing, interaction transitions, failure policy, lifetime, and composition.

**What stays below it?**
The domain decisions and detailed work owned by lower capabilities.

**May it import every transitively reachable module?**
Prefer the nearest capability that owns the behavior; permission is not encouragement.

**It only re-exports lower modules. Is it an orchestrator?**
No. It adds no broader capability and should usually disappear.

**Wiring obscures the workflow. What now?**
Separate the composition root that constructs dependencies from the orchestrator.

**Where do concrete implementations meet?**
At the entry or composition root; the orchestrator receives capability doors.

## Interactive module

An interactive module owns one path from user intent through transition and
derived state to rendering. Views emit intent and render results.

**Two views implement the same focus or visibility policy. What now?**
Move the policy to one pure owner and let both views consume it.

**One state value means different things in different modes. What now?**
Split it or model the alternatives as an explicit union.

**One action resets several unrelated state values. What now?**
Create a named transition in one interaction model.

**A primary action crosses several policy owners. What now?**
Reduce it to door, coordinator, and one focused capability path.

## Strata

Laymos declares no layers. Inside any Wrapper, siblings rank below the
siblings that import them, and that rank is the stratification. The direction
is the part that never changes: stable code at the bottom, volatile on top.

**Must a Wrapper have one facade?**
No. It may hold several independent capabilities; a Module has one Index.

**What should the outermost Module expose?**
The smallest useful interface for the system's external consumer.

**What must a higher Module add?**
A broader capability through workflow policy, never a pass-through re-export.

**What is at the bottom?**
Leaf capabilities depend on nothing; nothing inside them needs a Rule.

## Foundations

[Parnas 1972](https://doi.org/10.1145/361598.361623): information hiding.
[Parnas 1978](https://ocw.mit.edu/courses/16-355j-software-engineering-concepts-fall-2005/1c68d0f98909a126ec5eb6a0ff358ec7_parnas_ease.pdf):
uses hierarchies. [Parnas, Clements, and Weiss](https://doi.org/10.1109/TSE.1985.232209):
module versus runtime structure. [Ousterhout](https://web.stanford.edu/~ouster/CS349W/lectures/abstraction.html):
deep modules.
