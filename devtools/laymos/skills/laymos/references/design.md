# Module design

Read this when choosing boundaries, splitting or combining modules, declaring a
module graph, or designing orchestration. Concepts stay short; scenarios decide.

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

An exposed module's `<name>.ts` fulfils its promise through named collaborators.
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
Make a nested deep module; configure a graph only when its dependencies matter.

## Module Graph

A Module Graph makes the responsibility and dependency story of one large
capability explicit. It normally has one exposed facade and private members.

**When does a module become a Module Graph?**
When two or more internal capabilities stand alone and their dependency direction matters.

**What must connect to the facade?**
Every private member must lie on a path from at least one exposed member.

**May a graph expose several members?**
Only for independently consumed doors hiding the same decision, such as providers.

**A member is disconnected. What now?**
Make it a separate module or graph, unless its independent door explains the exception.

**Does a private member need `index.ts`?**
Yes. Graph peers use its door; `exposed` only controls access from other layers.

**Should graph rules mirror runtime calls?**
No. Rules express correctness dependencies, not execution chronology.

**When should A depend on B?**
When B simplifies A, B stands without A, and A needs B to fulfil its promise.

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

## Layer composition

A layer groups modules with the same dependency rights, not necessarily one
capability. Responsibility broadens upward as modules compose lower promises.

**Must a layer expose one facade?**
No. It may expose several independent capabilities; a Module Graph defaults to one.

**What should the outermost module expose?**
The smallest useful interface for the system's external consumer.

**What must a higher module add?**
A broader capability through workflow policy, never a pass-through re-export.

**What is at the bottom?**
Leaf capabilities depend on nothing; Laymos reports this observed shape as Terminal.

## Foundations

[Parnas 1972](https://doi.org/10.1145/361598.361623): information hiding.
[Parnas 1978](https://ocw.mit.edu/courses/16-355j-software-engineering-concepts-fall-2005/1c68d0f98909a126ec5eb6a0ff358ec7_parnas_ease.pdf):
uses hierarchies. [Parnas, Clements, and Weiss](https://doi.org/10.1109/TSE.1985.232209):
module versus runtime structure. [Ousterhout](https://web.stanford.edu/~ouster/CS349W/lectures/abstraction.html):
deep modules.
